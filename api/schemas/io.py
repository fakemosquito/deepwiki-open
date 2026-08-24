from typing import TypeVar

import anyio
from pydantic import BaseModel

_M = TypeVar("_M", bound=BaseModel)


async def asave(model: BaseModel, path: str, *, encoding: str = "utf-8"):
    """Asynchronous serialize and save a model"""

    payload = await anyio.to_thread.run_sync(model.model_dump_json)
    async with await anyio.open_file(path, mode="w", encoding=encoding) as file:
        await file.write(payload)


async def aload(model: type[_M], path: str, *, encoding: str = "utf-8") -> _M:
    """Asynchronous deserialize and load a model.

    File IO and Pydantic validation run in a worker thread so a large wiki
    cache cannot stall the event loop.
    """

    def _load() -> _M:
        with open(path, encoding=encoding) as file:
            return model.model_validate_json(file.read())

    return await anyio.to_thread.run_sync(_load)
