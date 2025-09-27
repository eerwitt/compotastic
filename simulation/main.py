import arcade

SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
SCREEN_TITLE = "Compotastic Simulation"


class DemoWindow(arcade.Window):
    def __init__(self) -> None:
        super().__init__(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)
        arcade.set_background_color(arcade.color.DARK_SLATE_BLUE)
        self.circle_x = SCREEN_WIDTH // 2
        self.circle_y = SCREEN_HEIGHT // 2
        self.circle_delta = 2

    def on_draw(self) -> None:
        """Draw the current frame."""
        self.clear()
        arcade.draw_text(
            "Compotastic Mesh Simulation",
            SCREEN_WIDTH / 2,
            SCREEN_HEIGHT - 80,
            arcade.color.LIGHT_GOLDENROD_YELLOW,
            font_size=32,
            anchor_x="center",
        )
        arcade.draw_circle_filled(self.circle_x, self.circle_y, 50, arcade.color.ANDROID_GREEN)
        arcade.draw_text(
            "Built with Arcade and pygbag",
            SCREEN_WIDTH / 2,
            80,
            arcade.color.COLUMBIA_BLUE,
            font_size=20,
            anchor_x="center",
        )

    def on_update(self, delta_time: float) -> None:
        """Animate the circle to keep the scene dynamic."""
        self.circle_x += self.circle_delta * 120 * delta_time
        if self.circle_x > SCREEN_WIDTH - 50 or self.circle_x < 50:
            self.circle_delta *= -1


def main() -> None:
    """Entrypoint for launching the demo window."""
    DemoWindow()
    arcade.run()


if __name__ == "__main__":
    main()
