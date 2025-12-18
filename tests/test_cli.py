import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import pm.cli as cli  # type: ignore[import-not-found]  # noqa: E402


def run_cli(args):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SRC)
    cmd = [sys.executable, "-m", "pm.cli", *args]
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    return result.returncode, result.stdout, result.stderr


def test_help_root():
    code, out, err = run_cli(["--help"])
    assert code == 0
    assert "Usage" in out
    assert "prd" in out


def test_help_prd():
    code, out, err = run_cli(["prd", "--help"])
    assert code == 0
    assert "--out" in out


def test_missing_out_argument_errors():
    code, out, err = run_cli(["prd"])
    assert code == 2
    assert "--out" in err or "Missing" in err


def test_prd_writes_stub(tmp_path: Path):
    out_path = tmp_path / "stub.md"
    code, out, err = run_cli(["prd", "--out", str(out_path)])
    assert code == 0
    assert out_path.exists()
    assert out_path.read_text().startswith("# PRD")
    assert "Wrote PRD stub" in out


def test_prd_json_output(tmp_path: Path):
    out_path = tmp_path / "stub.md"
    code, out, err = run_cli(["prd", "--out", str(out_path), "--json"])
    assert code == 0
    payload = json.loads(out.strip())
    assert payload["out"] == str(out_path)
    assert payload["stub"] is True
