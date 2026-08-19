from __future__ import annotations

import os
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="quanyi-migration-") as temp_dir:
        database = Path(temp_dir) / "verify.db"
        os.environ["DATABASE_URL"] = f"sqlite:///{database.as_posix()}"
        config = Config("alembic.ini")
        command.upgrade(config, "head")
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        print("migration round-trip ok")


if __name__ == "__main__":
    main()
