# grasstube
## Multi channel synchronized player written in Elixir / Phoenix

Includes soft subtitle rendering using [SubtitlesOctopus](https://github.com/Dador/JavascriptSubtitlesOctopus)

[o.okea.moe](https://o.okea.moe)

### getting started

```
git clone https://github.com/wwww-wwww/grasstube.git
cd grasstube && mix deps.get
cd assets && npm install && cd ..
iex -S mix phx.server
```

### todo
- [x] custom player
  - [ ] google drive support
- [x] authentication
  - [ ] user created rooms
    - [ ] editing rooms
  - [x] user provided list of emotes
