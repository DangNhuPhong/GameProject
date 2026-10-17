from PIL import Image

W, H = 16, 20

def palette(shirt, shirt_dark):
    return {
        ".": None,
        "O": (0x1e, 0x1b, 0x2e),   # viền
        "W": (0xf8, 0xfa, 0xfc),   # mũ trắng
        "G": (0xcb, 0xd5, 0xe1),   # mũ đổ bóng
        "S": (0xf5, 0xc9, 0xa0),   # da
        "s": (0xd9, 0xa2, 0x73),   # da tối
        "E": (0x1e, 0x1b, 0x2e),   # mắt
        "K": (0x5b, 0x3a, 0x29),   # tóc
        "B": shirt,                # áo
        "b": shirt_dark,
        "A": (0xf1, 0xf5, 0xf9),   # tạp dề
        "P": (0x33, 0x41, 0x55),   # quần
        "H": (0x4b, 0x2e, 0x1e),   # giày
    }

HAT = [
    ".....OOOOOO.....",
    "....OWWWWWWO....",
    "...OWWWWWWWWO...",
    "...OWWWWWWGWO...",
    "...OGGGGGGGGO...",
    "...OOOOOOOOOO...",
]

DOWN_BODY = [
    "....OSSSSSSO....",
    "....OSESSESO....",
    "....OSSSSSSO....",
    ".....OsSSsO.....",
    "......OOOO......",
    "..OBBBBBBBBBBO..",
    "..OBBAAAAAABBO..",
    "..OSBAAAAAABSO..",
    "...OBAAAAAABO...",
    "...OPPPPPPPPO...",
]

UP_BODY = [
    "....OKKKKKKO....",
    "....OKKKKKKO....",
    "....OKKKKKKO....",
    ".....OKKKKO.....",
    "......OOOO......",
    "..OBBBBBBBBBBO..",
    "..OBBBBBBBBBBO..",
    "..OSBBBBBBBBSO..",
    "...OBBBBBBBBO...",
    "...OPPPPPPPPO...",
]

SIDE_BODY = [  # nhìn sang trái
    "....OSSSSKKO....",
    "....OESSSKKO....",
    "....OSSSSKKO....",
    ".....OsSSSO.....",
    "......OOOO......",
    "...OBBBBBBBBO...",
    "...OAABBBBBBO...",
    "...OASBBBBBBO...",
    "...OAABBBBBBO...",
    "...OPPPPPPPPO...",
]

# 4 khung: 0 đứng, 1 bước trái, 2 đứng, 3 bước phải
FRONT_LEGS = {
    0: ["....OPPPPPPO....", "....OPPOOPPO....", "....OHHOOHHO....", "....OOOOOOOO...."],
    1: ["....OPPPPPPO....", "....OPPOOHHO....", "....OHHOOOOO....", "....OOOO........"],
    3: ["....OPPPPPPO....", "....OHHOOPPO....", "....OOOOOHHO....", "........OOOO...."],
}
FRONT_LEGS[2] = FRONT_LEGS[0]

SIDE_LEGS = {
    0: ["....OPPPPPPO....", "....OPPPPPPO....", "....OHHHPPPO....", "....OOOOOOOO...."],
    1: ["....OPPPPPPO....", "...OPPO..OPPO...", "...OHHO..OHHO...", "...OOOO..OOOO..."],
    3: ["....OPPPPPPO....", "....OPPPPPPO....", "...OHHHPPPPO....", "...OOOOOOOOO...."],
}
SIDE_LEGS[2] = SIDE_LEGS[0]

def build_frame(body, legs, pal):
    rows = HAT + body + legs
    assert len(rows) == H, len(rows)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == W, (y, row, len(row))
        for x, ch in enumerate(row):
            c = pal[ch]
            if c:
                img.putpixel((x, y), c + (255,))
    return img

def make_sheet(shirt, shirt_dark, path):
    pal = palette(shirt, shirt_dark)
    sheet = Image.new("RGBA", (W * 4, H * 3), (0, 0, 0, 0))
    rows = [(DOWN_BODY, FRONT_LEGS), (UP_BODY, FRONT_LEGS), (SIDE_BODY, SIDE_LEGS)]
    for r, (body, legs) in enumerate(rows):
        for f in range(4):
            sheet.paste(build_frame(body, legs[f], pal), (f * W, r * H))
    sheet.save(path)
    return sheet

blue = make_sheet((0x25, 0x63, 0xeb), (0x1e, 0x40, 0xaf), "chef-blue.png")
orange = make_sheet((0xf5, 0x9e, 0x0b), (0xb4, 0x53, 0x09), "chef-orange.png")

# Ảnh xem trước phóng to 8x
prev = Image.new("RGBA", (W * 4 * 8, H * 3 * 8 * 2), (0x3b, 0x82, 0x6e, 255))
prev.alpha_composite(blue.resize((W*4*8, H*3*8), Image.NEAREST), (0, 0))
prev.alpha_composite(orange.resize((W*4*8, H*3*8), Image.NEAREST), (0, H*3*8))
prev.save("preview.png")
print("ok")
