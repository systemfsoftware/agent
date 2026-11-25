{
  description = "Effect-native agents with durable Threads, as the agent, agent-storage-sql, agent-storage-sqlite, agent-storage-postgres, agent-storage-memory, agent-storage-cloudflare, agent-platform-node, agent-platform-cloudflare, agent-pr-review, agent-testing and agent-ai-decision packages.";

  nixConfig = {
    extra-substituters = "https://nix.systemfsoftware.com";
    extra-trusted-public-keys = "nix-cache-1:wXA8I4DayNW9q6enUyQA/P/nT38pGSTLt374t3gsn7M=";
  };

  inputs = {
    core.url = "github:systemfsoftware/systemfsoftware/15b4d2ab1e2af0a154fad2b9af7bd1f6449b3606";
    nixpkgs.follows = "core/nixpkgs";
    pnpm-release-management.url = "github:systemfsoftware/pnpm-release-management/1caca2828ed543409ae9ce0dceb949845a617564";
    gritlint.url = "github:systemfsoftware/gritlint/886e7c1646ba2edf93403b4591d2e3adceebf91c";
  };

  outputs = { self, nixpkgs, pnpm-release-management, gritlint, ... }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn: lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});

      workspaceOf = pkgs:
        pnpm-release-management.lib.mkPnpmWorkspacePackages {
          inherit pkgs;
          src = self;
          pname = "agent";
          pnpm = pkgs.pnpm_12;
        };
    in
    {
      packages = forEachSystem (pkgs: (workspaceOf pkgs) // {
        gritlint = gritlint.packages.${pkgs.stdenv.hostPlatform.system}.gritlint;
      });

      checks = forEachSystem (pkgs: {
        consumer-store = pnpm-release-management.lib.mkPnpmConsumerStore {
          inherit pkgs;
          src = self;
          pname = "agent";
          pnpm = pkgs.pnpm_12;
        };

        # The house convention packs, scanned over the tracked tree.
        gritlint = pkgs.runCommand "gritlint-check" {
          nativeBuildInputs = [ gritlint.packages.${pkgs.stdenv.hostPlatform.system}.gritlint ];
        } ''
          cd ${self}
          gritlint check . | tee $out
        '';
      });

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.pnpm_12
          ];
        };
      });
    };
}
