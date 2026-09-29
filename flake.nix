{
	description = "vicinae Calendar (EDS) extension";

	inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

	outputs = { self, nixpkgs }:
		let
			systems = [ "x86_64-linux" "aarch64-linux" ];
			forAllSystems = f:
				nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
		in {
			packages = forAllSystems (pkgs:
				let
					python = pkgs.python3.withPackages (ps: [ ps.pygobject3 ]);

					# Everything ECal/EDataServer pull in transitively, plus
					# gobject-introspection for the base libxml2 typelib.
					typelibPackages = with pkgs; [
						evolution-data-server
						libical
						libsoup_3
						json-glib
						gnome-online-accounts
						gcr_4
						libsecret
						gobject-introspection
					];

					giPath = pkgs.lib.makeSearchPath "lib/girepository-1.0" typelibPackages;

					# Drop-in `python3` that can import EDataServer/ECal/ICalGLib.
					# Point the extension's `python` preference at this.
					eds-python = pkgs.writeShellScriptBin "eds-python" ''
						export GI_TYPELIB_PATH="${giPath}''${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
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
						evolution-data-server
						libical
					];
					GI_TYPELIB_PATH = pkgs.lib.makeSearchPath "lib/girepository-1.0" (with pkgs; [
						evolution-data-server
						libical
						libsoup_3
						json-glib
						gnome-online-accounts
						gcr_4
						libsecret
						gobject-introspection
					]);
				};
			});
		};
}
