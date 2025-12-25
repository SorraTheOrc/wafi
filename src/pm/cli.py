import json
import sys
from pathlib import Path

import typer

app = typer.Typer(
    add_completion=False, no_args_is_help=True, pretty_exceptions_enable=False
)


prd_app = typer.Typer(add_completion=False, pretty_exceptions_enable=False)
app.add_typer(prd_app, name="prd", help="PRD generation commands")


class CliError(Exception):
    def __init__(self, message: str, exit_code: int = 1):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


@prd_app.callback(invoke_without_command=True)
def prd(
    ctx: typer.Context,
    out: Path = typer.Option(..., "--out", help="Path to write PRD stub"),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON output"),
    verbose: bool = typer.Option(False, "--verbose", help="Emit debug logs to stderr"),
):
    """Generate a stub PRD markdown file."""
    try:
        if ctx.invoked_subcommand is not None:
            return

        if verbose:
            typer.echo(f"[debug] writing stub to {out}", err=True)

        out.parent.mkdir(parents=True, exist_ok=True)
        stub = "# PRD\n\n## Summary\n\nTBD\n"
        out.write_text(stub, encoding="utf-8")

        if json_output:
            typer.echo(json.dumps({"out": str(out), "stub": True}))
        else:
            typer.echo(f"Wrote PRD stub to {out}")
    except Exception as exc:  # noqa: BLE001
        raise CliError(str(exc), exit_code=1) from exc


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    try:
        app(prog_name="pm", args=argv)
    except CliError as err:
        typer.echo(err.message, err=True)
        return err.exit_code
    except typer.Exit as exit_exc:  # Typer uses this for normal flow (help/usage)
        return exit_exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
