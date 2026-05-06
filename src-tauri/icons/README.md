# Icons

These files aren't committed. Before the first `pnpm tauri build`, generate them
from a 512×512 PNG (or larger):

```
pnpm tauri icon path/to/source.png
```

The Tauri CLI writes `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
and `icon.ico` here.
