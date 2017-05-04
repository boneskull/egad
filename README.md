# egad

> Compile a Git repo full of Handlebars templates

## Basic Usage

```js
const {scaffold} = require('egad');

scaffold('https://github.com/<your>/<repo>', '/path/to/destination/dir', {
  some: 'data',
  forYour: 'templates'
}, {
  // default options
  overwrite: true,
  offline: false,
  remote: 'origin',
  branch: 'master'
})
  .then(filepaths => {
    console.log(`Wrote files: ${filepaths}`);
  })
```

The *entire repository* at the given URL will be inspected for Handlebars templates, and those templates will be rendered at the corresponding path under your destination directory.  Files *not* containing Handlebars templates will simply be copied.

If destination is omitted, it will default to the current working directory.

## Details

- Repos are stored in the user's XDG cache dir, or whatever XDG cache dir is available, or a temp dir as a last resort.
- If `offline` is `false`, the repo will be either cloned or updated (if a working copy already exists).
- If `offline` is `true` and the repo does not already exist, then you get an rejected `Promise`.
- Use environment variable `DEBUG=egad` to see debug output
- Requires a `git` executable
- **Requires Node.js v6 or greater**

## Known Issues

- Does not copy binary files
- No "errback"-style interface
- How about writing some tests?

## License

© 2017 [Christopher Hiller](https://boneskull.com).  Licensed Apache-2.0.
