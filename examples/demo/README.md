# Demo: Sprout

A complete `store/` project for a fictional plant-care app, renderable on any machine.

```bash
node examples/demo/make-captures.mjs            # app/icon.png and five screens in app/store/output/raw/
node bin/storeshots.mjs build examples/demo/app
```

`make-captures.mjs` stands in for `storeshots capture`: it draws the app's screens at the simulator's size (1320×2868). A real project captures the real app, or brings screenshots in with `storeshots import`.

How the project was made:

```bash
storeshots init examples/demo/app --shots today,plant,insights,calendar,reminders
# copy in app/store/copy/en.json; a closer slide added to "slides"
storeshots elements examples/demo/app            # then --slides <id> --pick <n> per slide
storeshots catalog style examples/demo/app       # then --pick: soft
storeshots style examples/demo/app
```
