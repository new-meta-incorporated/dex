module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    globals: {
        // https://github.com/kulshekhar/ts-jest/issues/823#issuecomment-515529012
        'ts-jest': {
            packageJson: 'package.json'
        }
    }
};
