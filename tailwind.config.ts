module.exports = {
    content: [
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {}, // 不自定义任何配置，全用 Tailwind 内置样式
    },
    plugins: [],
};