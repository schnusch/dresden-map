{
  buildNpmPackage,
  lib,
  esbuild,
  imagemagick,
  typescript,
  zopfli,
  sourceLink ? "https://github.com/schnusch/dresden-map/",

  caddy,
  writeShellScript,
  writeTextDir,
}:

let

  src = lib.sourceByRegex ./. [
    "index\\.html"
    ".*\\.svg"
    ".*\\.ts"
    "package\\.json"
    "package-lock\\.json"
    "tsconfig\\.json"
  ];

  package = with builtins; fromJSON (readFile "${src}/package.json");

  caddyfile = writeTextDir "Caddyfile" ''
    http://localhost:4000 {
        root * ${self}
        file_server {
            precompressed gzip
        }
    }
  '';

  htmlSourceLink = lib.escapeXML sourceLink;

  self = buildNpmPackage {
    pname = package.name;
    inherit (package) version;

    inherit src;

    npmDepsHash = "sha256-kTbHjgYTrq4cuIVrXs4uwRyj637oMuy/ZtyWCBV4EZs=";

    nativeBuildInputs = [
      esbuild
      imagemagick
      typescript
      zopfli
    ];

    postPatch = ''
      sed -e 's@<\/footer>@<div><a href="${htmlSourceLink}">source code</a></div>&@g' -i index.html
    '';

    installPhase = ''
      runHook preInstall

      cp --no-target-directory -r dist/ "$out"

      runHook postInstall
    '';

    passthru.run-caddy = writeShellScript "run-caddy" ''
      set -e
      cd ${caddyfile}
      exec ${lib.getExe caddy} run
    '';

    meta = {
      license = lib.licenses.beerware;
      maintainers = with lib.maintainers; [ schnusch ];
    };
  };

in

self
