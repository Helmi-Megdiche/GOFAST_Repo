# Icon map

Mockup icon codes (`{i:code}` in `docs/ui/sources`) to Lucide, used by `<Icon name="code" />`.
Checked against the inline SVGs in `docs/ui/screens` by rasterising each mockup icon and
every Lucide icon and measuring pixel overlap, then reviewing the doubtful ones by eye.

- Stroke width is 1.75 and the grid is 24 px, as in the mockup.
- **Directional** icons mirror under `dir="rtl"` (`al ar cl cr nav`). Pass `directional={false}`
  to turn it off, or `directional` to turn it on for another icon.
- The logo is never mirrored.

| Code     | Lucide        | Match with the mockup drawing  | Notes                                          |
| -------- | ------------- | ------------------------------ | ---------------------------------------------- |
| `al`     | ArrowLeft     | exact                          | directional                                    |
| `ar`     | ArrowRight    | exact                          | directional                                    |
| `cl`     | ChevronLeft   | exact                          | directional                                    |
| `cr`     | ChevronRight  | exact                          | directional                                    |
| `cd`     | ChevronDown   | not used in the mockup sources | from the brief                                 |
| `nav`    | Navigation    | exact                          | directional                                    |
| `bell`   | Bell          | very close                     |                                                |
| `bike`   | Motorbike     | closest silhouette             | hand-drawn in the mockup, no exact Lucide twin |
| `bldg`   | Building      | exact                          |                                                |
| `bolt`   | Zap           | same idea, different drawing   |                                                |
| `box`    | Box           | exact                          |                                                |
| `cal`    | Calendar      | exact                          |                                                |
| `cam`    | Camera        | very close                     |                                                |
| `cash`   | Banknote      | very close                     |                                                |
| `check`  | Check         | exact                          |                                                |
| `clock`  | Clock         | exact                          |                                                |
| `code`   | Code          | exact                          |                                                |
| `dl`     | Download      | exact                          |                                                |
| `doc`    | FileText      | close                          | the mockup page has text lines                 |
| `edit`   | Pencil        | close                          |                                                |
| `file`   | FileText      | close                          |                                                |
| `filter` | ListFilter    | exact shape                    |                                                |
| `flash`  | Zap           | same idea, different drawing   |                                                |
| `gps`    | LocateFixed   | exact                          |                                                |
| `home`   | House         | close                          | door drawn slightly differently                |
| `list`   | List          | exact shape                    |                                                |
| `msg`    | MessageSquare | exact shape                    |                                                |
| `nowifi` | WifiOff       | very close                     |                                                |
| `phone`  | Phone         | same shape                     |                                                |
| `pin`    | MapPin        | very close                     |                                                |
| `plus`   | Plus          | exact                          |                                                |
| `print`  | Printer       | very close                     |                                                |
| `rcpt`   | ReceiptText   | close                          | the mockup receipt has text lines, no `$`      |
| `ref`    | RefreshCw     | very close                     |                                                |
| `scan`   | ScanLine      | exact                          |                                                |
| `search` | Search        | exact                          |                                                |
| `shield` | ShieldCheck   | very close                     |                                                |
| `star`   | Star          | close                          |                                                |
| `truck`  | Truck         | exact                          |                                                |
| `ul`     | Upload        | exact                          |                                                |
| `user`   | User          | exact                          |                                                |
| `users`  | Users         | very close                     |                                                |
| `warn`   | TriangleAlert | very close                     |                                                |
| `x`      | X             | exact                          |                                                |
| `info`   | Info          | not in the mockup              | used by `Alert`                                |
| `ok`     | CircleCheck   | not in the mockup              | used by `Alert`                                |
| `err`    | CircleAlert   | not in the mockup              | used by `Alert`                                |
| `menu`   | Menu          | not in the mockup              | mobile menu (public site)                      |
