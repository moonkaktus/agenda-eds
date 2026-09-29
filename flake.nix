{
	description = "vicinae Calendar (EDS) extension";

	inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

	outputs = { self, nixpkgs }:
		let
			systems = [ "x86_64-linux" "aarch64-linux" ];
			forAllSystems = f:
				nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));

			# Everything ECal/EDataServer pull in transitively, plus
			# gobject-introspection for the base libxml2 typelib.
			typelibPackages = pkgs: with pkgs; [
				evolution-data-server
				libical
				libsoup_3
				json-glib
				gnome-online-accounts
				gcr_4
				libsecret
				gobject-introspection
			];
			giPath = pkgs: pkgs.lib.makeSearchPath "lib/girepository-1.0" (typelibPackages pkgs);
		in {
			packages = forAllSystems (pkgs:
				let
					python = pkgs.python3.withPackages (ps: [ ps.pygobject3 ]);

					# Drop-in `python3` that can import EDataServer/ECal/ICalGLib.
					# Point the extension's `python` preference at this.
					eds-python = pkgs.writeShellScriptBin "eds-python" ''
						export GI_TYPELIB_PATH="${giPath pkgs}''${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
						exec ${python}/bin/python3 "$@"
					'';
				in {
					inherit eds-python;
					default = eds-python;
				});

			devShells = forAllSystems (pkgs: {
				default = pkgs.mkShell {
					packages = with pkgs; [
						nodejs
						python3Packages.pygobject3
					];
					GI_TYPELIB_PATH = giPath pkgs;
				};
			});
		};
}
