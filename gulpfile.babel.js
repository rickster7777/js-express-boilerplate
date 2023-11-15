import gulp from 'gulp';
import babel from 'gulp-babel';
import path from 'path';
import uglify from 'gulp-uglify';
import newer from 'gulp-newer';
import del from 'del';
import gulpNodemon from 'gulp-nodemon';

/**
 @constant
 @type {Object}
 @default
 @description An object containing file path patterns for JavaScript and non-JavaScript files.
 @property {Array} js - The file path pattern for JavaScript files.
 @property {Array} nonJs - The file path patterns for non-JavaScript files.
 */
const paths = {
    js: ['src/**/*.js', '!gulpfile.babel.js'],
    nonJs: ['src/**/*.{ejs,html,yaml}', '!dist/**', '!node_modules'],
};

/**
 Deletes the 'dist' folder and its contents.
 @function
 @name clean
 @returns {Promise} A Promise that resolves when the 'dist' folder is deleted.
 */
export const clean = () => del(['dist']);

/**

 Compiles JavaScript files from the 'src' folder to the 'dist' folder.
 JavaScript files are transpiled using Babel and minified using UglifyJS.
 @function
 @name compile
 @returns {NodeJS.ReadWriteStream} A stream that compiles JavaScript files and writes them to the 'dist' folder.
 */
export const compile = () => gulp.src(paths.js, { base: '.', sourcemaps: true }).pipe(newer('dist')).pipe(babel()).pipe(uglify()).pipe(gulp.dest('dist'));

/**
 Copies non-JavaScript files from the 'src' folder to the 'dist' folder.
 @function
 @name copy
 @returns {NodeJS.ReadWriteStream} A stream that copies non-JavaScript files and writes them to the 'dist' folder.
 */
export const copy = () => gulp.src(paths.nonJs).pipe(gulp.dest('dist/src'));

/**
 Runs the Node.js server using Nodemon.
 Watches for changes in the 'dist' folder and restarts the server when changes are detected.
 @function
 @name nodemon
 @returns {NodeJS.ReadWriteStream} A stream that runs the Node.js server using Nodemon.
 */
export const nodemon = (done) => {
    return gulpNodemon({
        script: path.join('dist/src', 'app.js'),
        ext: 'js',
        ignore: ['node_modules/**/*.js', 'dist/**/*.js'],
        delay: 1000,
    })
        .on('restart', compile)
        .on('quit', done); // signal async completion;
};

/**
 Cleans the 'dist' folder, reads all keys from the key vault, and then copies non-JavaScript files and
 compiles JavaScript files to the 'dist' folder. Finally, runs the Node.js server using Nodemon.
 @function
 @name serve
 @returns {NodeJS.ReadWriteStream} A stream that serves the brandApp.
 */
export const serve = gulp.series(clean, gulp.parallel(copy, compile), nodemon);

/**

 Cleans the 'dist' folder, reads all keys from the key vault, and then copies non-JavaScript files and compiles JavaScript files to the 'dist' folder.
 @function
 @name build
 @returns {NodeJS.ReadWriteStream} A stream that builds the brandApp.
 */
export const build = gulp.series(clean, gulp.parallel(copy, compile));

export default build;
