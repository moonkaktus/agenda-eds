{
	description = "vicinae Calendar (EDS) extension";

	inputs = {
		nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
	};

	outputs = { self, nixpkgs }:
		let
			systems = [ "x86_64-linux" "aarch64-linux" ];
			forAllSystems = f:
				nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
		in {
			packages = forAllSystems (pkgs:
				let
					lib = pkgs.lib;

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

					# Same recipe as vicinae's mkVicinaeExtension, but without
					# pulling the vicinae flake in as an input.
					extension = pkgs.buildNpmPackage {
						name = "calendar-eds";
						version = "0.1.0";
						inherit src;
						npmDeps = pkgs.fetchNpmDeps {
							inherit src;
							hash = "sha256-xMyMIwV6Lnh1S/1jT5DuTmwAA+xaOIqpuo0gIVmz3M4=";
							npmRegistryOverridesString = ''{"registry.npmjs.org":"https://mirrors.cloud.tencent.com/npm"}'';
						};
						buildPhase = "npm run build -- --out=$out";
						dontNpmInstall = true;
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
