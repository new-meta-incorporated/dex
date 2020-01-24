
const CSSModules = require('broccoli-css-modules');
const funnel = require('broccoli-funnel');
const mergeTrees = require('broccoli-merge-trees');
const fs = require('fs');

let buildDir;
if (fs.existsSync('./build')) {
    buildDir = funnel('./build', {destDir: '.', allowEmpty: true});
}

const modules = new CSSModules(funnel('.', { include: ['*.css'] }), {
    getJSFilePath(cssPath) {
        return cssPath.replace(/\.css$/, '.css.js');
    },
    plugins: [require('postcss-nested')]
});

if (buildDir) {
    module.exports = mergeTrees([buildDir, modules], {overwrite: true});
} else {
    module.exports = modules;
}
