from server.app import app, create_app


def main() -> None:
    import uvicorn

    uvicorn.run("server.app:app", host="127.0.0.1", port=8000)


__all__ = ["app", "create_app", "main"]
