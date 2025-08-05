const gulp = require('gulp');
const postcss = require('gulp-postcss');
const pxtounits = require('postcss-px2units');

gulp.task('css', () => {
    return gulp.src(['fabric/components/counter/*.wxss'])
        .pipe(postcss([pxtounits({
            multiple: 2, // 1px = 2rpx
            targetUnits: 'rpx'
        })]))
        .pipe(gulp.dest('fabric/components/counter/'));
});