from __future__ import annotations

import argparse
import getpass

from sqlmodel import Session

from .accounts import bootstrap_admin
from .database import engine


def main() -> None:
    parser = argparse.ArgumentParser(description="全意 AI Task OS 管理命令")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_admin = subparsers.add_parser("create-admin", help="在空数据库中创建首位管理员和团队")
    create_admin.add_argument("--email", required=True)
    create_admin.add_argument("--name", required=True)
    create_admin.add_argument("--team", required=True)
    args = parser.parse_args()
    if args.command == "create-admin":
        password = getpass.getpass("设置管理员密码：")
        confirmation = getpass.getpass("再次输入管理员密码：")
        if password != confirmation:
            raise SystemExit("两次密码不一致")
        with Session(engine) as session:
            user = bootstrap_admin(session, args.email, args.name, password, args.team)
        print(f"管理员已创建：{user.email}")


if __name__ == "__main__":
    main()
