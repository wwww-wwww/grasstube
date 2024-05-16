Current available hooks:
- :room
- :playlist

Hooks will call these methods:
- load(view)
- unload() (Optional)

Globally availabe views:
- `window.__chat`
- `window.__playlist`

Example:

```javascript
function keydown(e) {
  if (e.key == "x") {
    window.__chat.send("hello world")
  }
}

return {
  load: (_room) => {
    document.addEventListener("keydown", keydown)
  },
  unload: () => {
    document.removeEventListener("keydown", keydown)
  },
  on_message: (data) => {},
  on_set_video: (data) => {},
}
```
