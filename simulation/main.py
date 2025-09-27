import asyncio
import importlib.util
from typing import Any, Optional

import pygame


def _disable_beforeunload_prompt() -> None:
    """Remove the default browser prompt about unsaved changes."""

    js_spec = importlib.util.find_spec("js")
    if js_spec is None:
        return

    from js import window  # type: ignore[attr-defined]

    remove_event_listener: Optional[Any]
    remove_event_listener = getattr(window, "removeEventListener", None)
    previous_handler: Optional[Any]
    previous_handler = getattr(window, "onbeforeunload", None)

    if callable(remove_event_listener) and previous_handler is not None:
        remove_event_listener("beforeunload", previous_handler)

    window.onbeforeunload = None


pygame.init()
pygame.display.set_mode((320, 240))
clock = pygame.time.Clock()

_disable_beforeunload_prompt()


async def main():
    count = 60

    while True:
        print(f"{count}: Hello from Pygame")
        pygame.display.update()
        await asyncio.sleep(0)  # You must include this statement in your main loop. Keep the argument at 0.

        if not count:
            pygame.quit()
            return
        
        count -= 1
        clock.tick(60)

asyncio.run(main())
