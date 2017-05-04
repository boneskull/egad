'use strict';

const debug = require('debug')('egad');
const promisify = require('es6-promisify');
const fs = require('fs');
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);
const mkdirp = promisify(require('mkdirp'));
const path = require('path');
const xdgBasedir = require('xdg-basedir');
const Walker = require('walker');
const _ = require('lodash/fp');
const render = promisify(require('consolidate').handlebars.render);
const isBinaryPath = require('is-binary-path');
const git = require('simple-git');
const rimraf = promisify(require('rimraf'));

const xdgCachedir = xdgBasedir.cache || require('os')
    .tmpdir();

const cachedir = _.partial(path.join, [
  xdgCachedir,
  '.egad-templates'
]);
const destPath = _.pipe(_.kebabCase, cachedir);

/**
 * Downloads (clones) a Git repo
 * @param {string} url - URL of Git repo
 * @param {Object} [opts] - Options
 * @param {string} [opts.dest] - Destination path; default is a user cache dir
 * @param {boolean} [opts.offline=false] - If true, just check for existence of
 *   working copy
 * @param {string} [opts.remote=origin] - Git remote
 * @param {string} [opts.branch=master] - Git branch
 * @returns {Promise.<string>} Destination path
 */
function download (url, opts = {}) {
  opts = _.defaults({
    dest: destPath(url),
    offline: false,
    remote: 'origin',
    branch: 'master'
  }, opts);
  debug(`Download target at ${opts.dest}`);
  return mkdirp(cachedir())
    .then(() => stat(opts.dest))
    .then(stats => {
      if (!stats.isDirectory()) {
        throw new Error(`File exists at ${opts.dest}`);
      }
      const wc = git(opts.dest);
      return new Promise((resolve, reject) => {
        debug(`Updating working copy at ${opts.dest}`);
        wc.pull(opts.remote, opts.branch, {'--rebase': 'true'}, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    })
    .catch(err => {
      if (opts.offline) {
        throw new Error(`No cache of ${url} exists in ${opts.dest}`);
      }
      debug(err);
      return rimraf(opts.dest)
        .then(() => {
          debug(`Cloning repo ${url}`);
          const wc = git();
          return new Promise((resolve, reject) => {
            wc.clone(url, opts.dest, err => {
              if (err) {
                return reject(err);
              }
              resolve();
            });
          });
        });
    })
    .then(() => opts.dest);
}

/**
 * Renders files containing Handlebars templates recursively from one path to
 * another.
 * @param {string} source - Source directory, containing templates
 * @param {string} dest - Destination (output) directory
 * @param {Object} [data] - Data for template(s)
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.overwrite=true] - Set to `false` to avoid overwriting
 *   existing files
 * @returns {Promise.<string[]>} Destination filepaths successfully written to
 */
function generate (source, dest, data = {}, opts = {}) {
  opts = _.defaults({
    overwrite: true
  }, opts);
  debug(`Generating from ${source} to ${dest}`);
  return mkdirp(dest)
    .then(() => new Promise((resolve, reject) => {
      const queue = [];
      Walker(source)
        .filterDir(_.negate(_.endsWith('.git')))
        .on('file', sourceFilepath => {
          debug(`Trying ${sourceFilepath}`);
          if (!isBinaryPath(sourceFilepath)) {
            debug(`Queuing ${sourceFilepath}`);
            return queue.push(sourceFilepath);
          }
          debug(`Skipping ${sourceFilepath}; binary`);
        })
        .on('error', reject)
        .on('end', () => resolve(queue));
    }))
    .then(queue => Promise.all(queue.map(sourceFilepath => {
      const destFilepath = path.join(dest,
        path.relative(source, sourceFilepath));
      return Promise.all([
        readFile(sourceFilepath, 'utf8')
          .then(str => {
            if (/{{([^{}]+)}}/g.test(str)) {
              debug(`Rendering template ${sourceFilepath}`);
              return render(str, data);
            }
            return str;
          }),
        mkdirp(path.dirname(destFilepath))
      ])
        .then(([str]) => writeFile(destFilepath, str, {
          encoding: 'utf8',
          // This is rather crude
          flag: opts.overwrite
            ? 'w'
            : 'wx'
        })
          .then(() => {
            debug(`Wrote ${destFilepath}`);
            return destFilepath;
          })
          .catch(err => {
            if (err.code === 'EEXIST') {
              debug(`Skipping ${destFilepath}; already exists`);
              return;
            }
            throw err;
          }));
    })))
    .then(_.compact);
}

/**
 * Combines download() & generate()
 * @param {string} url - Git repo url
 * @param {string} [dest] - Destination path; defaults to current working dir
 * @param {Object} [data] - Data for template(s)
 * @param {Object} [opts] - Options for both `download()` & `generate()`
 * @returns {Promise.<string[]>} Destination filepaths successfully written to
 */
function scaffold (url, dest = process.cwd(), data = {}, opts = {}) {
  return download(url, opts)
    .then(templateDir => {
      debug(`${url} cloned into ${templateDir}`);
      return generate(templateDir, dest, data, opts);
    });
}

module.exports = {
  generate,
  download,
  scaffold
};
