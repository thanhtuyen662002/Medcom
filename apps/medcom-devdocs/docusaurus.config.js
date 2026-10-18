const {themes} = require('prism-react-renderer');
module.exports = {
  title: 'Tài liệu Medcom ERP',
  tagline: 'API, cấu trúc dữ liệu và quy trình xử lý',
  favicon: 'img/favicon.svg',
  url: process.env.DOCS_URL || 'https://docs.medcom.example',
  baseUrl: process.env.DOCS_BASE_URL || '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {hooks: {onBrokenMarkdownLinks: 'throw'}},
  i18n: {defaultLocale: 'vi', locales: ['vi']},
  presets: [['classic', {
    docs: {routeBasePath: 'docs', sidebarPath: require.resolve('./sidebars.js'), showLastUpdateTime: false},
    blog: false,
    theme: {customCss: require.resolve('./src/css/custom.css')},
  }]],
  themeConfig: {
    colorMode: {defaultMode: 'light', respectPrefersColorScheme: true},
    navbar: {
      title: 'Tài liệu kỹ thuật',
      logo: {alt: 'Medcom', src: 'img/medcom-logo.png', srcDark: 'img/medcom-logo-dark.png'},
      items: [
        {type: 'docSidebar', sidebarId: 'developer', label: 'Tài liệu', position: 'left'},
        {to: '/api', label: 'Tra cứu API', position: 'left'},
        {to: '/docs/agents/context', label: 'Tệp tài liệu', position: 'left'},
        {href: 'http://localhost:3000/help', label: 'Hướng dẫn sử dụng', position: 'right'},
        {type: 'custom-search', position: 'right'},
      ],
    },
    docs: {sidebar: {hideable: true, autoCollapseCategories: true}},
    footer: {style: 'dark', copyright: 'Medcom ERP · Tài liệu kỹ thuật API'},
    prism: {theme: themes.github, darkTheme: themes.dracula, additionalLanguages: ['bash', 'json', 'typescript', 'csharp', 'sql', 'http']},
    tableOfContents: {minHeadingLevel: 2, maxHeadingLevel: 3},
  },
};
