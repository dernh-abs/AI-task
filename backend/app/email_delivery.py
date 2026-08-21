from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Literal
from urllib.parse import urlencode

from .config import Settings


EmailDeliveryStatus = Literal["SENT", "NOT_CONFIGURED", "FAILED"]
logger = logging.getLogger(__name__)


def invitation_url(settings: Settings, activation_token: str) -> str:
    return f"{settings.public_app_url}?{urlencode({'invite': activation_token})}"


def build_invitation_message(
    settings: Settings,
    *,
    recipient: str,
    team_name: str,
    inviter_name: str,
    activation_url: str,
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = f"邀请加入「{team_name}」"
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient
    message.set_content(
        f"{inviter_name} 邀请你加入「{team_name}」。\n\n"
        f"请在 72 小时内打开以下一次性链接完成注册：\n{activation_url}\n\n"
        "如果你不认识邀请人，请忽略此邮件。"
    )
    message.add_alternative(
        "<html><body>"
        f"<p>{html.escape(inviter_name)} 邀请你加入「{html.escape(team_name)}」。</p>"
        "<p>请在 72 小时内使用下面的一次性链接完成注册：</p>"
        f'<p><a href="{html.escape(activation_url, quote=True)}">接受邀请并注册</a></p>'
        "<p style=\"color:#667085\">如果你不认识邀请人，请忽略此邮件。</p>"
        "</body></html>",
        subtype="html",
    )
    return message


def smtp_is_configured(settings: Settings) -> bool:
    return all((settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from_email))


def send_invitation_email(
    settings: Settings,
    *,
    recipient: str,
    team_name: str,
    inviter_name: str,
    activation_token: str,
) -> EmailDeliveryStatus:
    if not smtp_is_configured(settings):
        return "NOT_CONFIGURED"

    try:
        message = build_invitation_message(
            settings,
            recipient=recipient,
            team_name=team_name,
            inviter_name=inviter_name,
            activation_url=invitation_url(settings, activation_token),
        )
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
                context=ssl.create_default_context(),
            ) as client:
                client.login(settings.smtp_username, settings.smtp_password)
                client.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as client:
                if settings.smtp_use_starttls:
                    client.starttls(context=ssl.create_default_context())
                client.login(settings.smtp_username, settings.smtp_password)
                client.send_message(message)
    except (OSError, ValueError, smtplib.SMTPException):
        logger.warning("Invitation email delivery failed (%s)", settings.smtp_host)
        return "FAILED"
    return "SENT"
