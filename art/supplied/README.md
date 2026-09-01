# Border art

Drop illuminated border images here, then run:

    python3 art/frames.py
    node build.mjs

Anything readable works: PNG, JPEG or WebP, with a clear centre for the text.
Each plate is filed by the shape it actually is, and the reader picks whichever
is nearest to the screen in front of it.

## Shapes worth having

| Shape       | Aspect      | Good size   | Used on                  |
| ----------- | ----------- | ----------- | ------------------------ |
| `tall`      | under 0.60  | 1240 x 2560 | a phone held upright     |
| `portrait`  | 0.60 – 0.95 | 1350 x 1800 | an iPad held upright     |
| `landscape` | 1.05 – 1.55 | 1800 x 1350 | an iPad on its side      |
| `wide`      | over 1.55   | 2000 x 1150 | a desktop window         |

**The tall ones are the gap.** A phone is about 0.46 wide to tall, and the
closest plate on hand is 0.75, so the app has to pull it half again taller to
fill the screen and every creature stretches with it. Four plates drawn at
1240 x 2560 would remove that completely: the app would pick them for phones
on its own and stretch almost nothing.

The border should sit in the outer fifth of the image, with the middle left as
plain parchment. That is where the text goes.
