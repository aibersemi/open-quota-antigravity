const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                vscode: "readonly",
                console: "readonly",
                require: "readonly",
                module: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                process: "readonly",
                __dirname: "readonly",
                Buffer: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { 
                "argsIgnorePattern": "^_", 
                "varsIgnorePattern": "^(e|ign|_)$",
                "caughtErrorsIgnorePattern": "^(e|ign|_)$"
            }],
            "no-empty": ["error", { "allowEmptyCatch": true }]
        }
    }
];
