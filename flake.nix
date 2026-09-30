{
	description = "vicinae Calendar (EDS) extension";

	inputs = {
		nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
		vicinae = {
			url = "github:vicinaehq/vicinae";
			inputs.nixpkgs.follows = "nixpkgs";
		};
	};

	outputs = { self, nixpkgs, vicinae }:
		let
			systems = [ "x86_64-linux" "aarch64-linux" ];
			forAllSystems = f:
				nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
		in {
			packages = forAllSystems (pkgs:
				let
					lib = pkgs.lib;
					system = pkgs.stdenv.hostPlatform.system;

					src = lib.fileset.toSource {
						root = ./.;
						fileset = lib.fileset.unions [
							./package.json
							./package-lock.json
							./tsconfig.json
							./src
							./assets
						];
					};

					extension = vicinae.lib.${system}.mkVicinaeExtension {
						pname = "calendar-eds";
						version = "0.1.0";
						name = "calendar-eds";
						inherit src;
					};
				in {
					default = extension;
				});

			# No EDS/Python here: the helper's interpreter (`eds-python`) is
			# provided by the host config so it shares the running EDS. Test the
			# helper with that interpreter on PATH:
			#   eds-python assets/eds-helper.py --days 1
			devShells = forAllSystems (pkgs: {
				default = pkgs.mkShell {
					packages = with pkgs; [
						nodejs
					];
				};
			});
		};
}
