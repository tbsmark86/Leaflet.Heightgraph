import nodeResolve from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'

// noinspection JSUnusedGlobalSymbols
export default {
    input: 'src/L.Control.Heightgraph.js',
    output: [
        {
            file: 'dist/L.Control.Heightgraph.js',
            format: 'iife',
	    /* for safer user by the next bundler */
	    banner: ';'
        },
    ],
    plugins: [
        nodeResolve({
            mainFields: ['module','jsnext', 'main']
        }),
        copy({
            targets: [
                { src: 'src/img/**/*', dest: 'dist/img'},
                { src: 'src/*.css', dest: 'dist/'}
            ]
        })
    ],
    external: ['leaflet'],
    // see e.g. https://github.com/rollup/rollup/issues/2271
    onwarn (warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
    }
};
