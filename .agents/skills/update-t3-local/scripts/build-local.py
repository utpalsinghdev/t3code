#!/usr/bin/env python3
"""Build Local desktop and SSH runtimes with one version and restore manifests."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--resource-monitor-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--temp-dir", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+-local\.\d+", args.version):
        parser.error("--version must be a new full version such as 0.1.3-local.7")
    root = Path(__file__).resolve().parents[4]
    monitors = args.resource_monitor_dir.resolve(strict=True)
    output = args.output_dir.resolve()
    if output.exists():
        parser.error("--output-dir must be new; releases must not overwrite an existing version")
    for arch in ("x64", "arm64"):
        binary = monitors / f"linux-{arch}" / "t3-resource-monitor"
        if not binary.is_file():
            parser.error(f"missing target resource monitor: {binary}")
    env = dict(os.environ, APP_VERSION=args.version)
    if args.temp_dir:
        temp = args.temp_dir.resolve(strict=True)
        env["TMPDIR"] = str(temp)
        tempfile.tempdir = str(temp)
    node = subprocess.check_output(
        ["node", "-p", "process.execPath"], cwd=root, env=env, text=True
    ).strip()
    major = int(subprocess.check_output([node, "-p", "process.versions.node.split('.')[0]"], text=True))
    if major < 26:
        parser.error("use the repository's Node 26 runtime for cross-platform executable builds")
    lock = root / ".desktop-build.lock"
    lock.mkdir()
    manifests = [root / p for p in (
        "apps/server/package.json", "apps/desktop/package.json",
        "apps/web/package.json", "packages/contracts/package.json",
    )]
    originals = {}
    try:
        originals = {p: p.read_bytes() for p in manifests}
        output.mkdir(parents=True)
        for p, original in originals.items():
            manifest = json.loads(original)
            manifest["version"] = args.version
            p.write_text(json.dumps(manifest, indent=2) + "\n")
        subprocess.run(["vp", "run", "build:desktop"], cwd=root, env=env, check=True)
        archives = output / "ssh-runtimes"
        for arch in ("x64", "arm64"):
            subprocess.run(
                [node, "scripts/cli.ts", "build-exe", "--target", f"linux-{arch}"],
                cwd=root / "apps/server", env=env, check=True,
            )
            subprocess.run(
                [node, "scripts/build-cli-archive.ts", "--platform", "linux", "--arch", arch,
                 "--version", args.version, "--resource-monitor-dir", str(monitors),
                 "--output-dir", str(archives)], cwd=root, env=env, check=True,
            )
    finally:
        for p, original in originals.items():
            p.write_bytes(original)
        lock.rmdir()
    subprocess.run(
        [node, "scripts/build-desktop-artifact.ts", "--platform", "mac", "--target", "dmg",
         "--arch", "arm64", "--build-version", args.version, "--skip-build",
         "--ssh-runtimes", str(archives), "--output-dir", str(output / "desktop")],
        cwd=root, env=env, check=True,
    )
    print(f"Built {args.version}: {output}")


if __name__ == "__main__":
    main()
