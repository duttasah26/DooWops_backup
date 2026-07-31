/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retro: {
          lime: "#B5D333",
          "lime-dark": "#96BF1F",
          black: "#0D0D0D",
          teal: "#2EBED6",
          green: "#009B36",
          blue: "#2A61D1",
          olive: "#8CA33C",
          link: "#1A0DAB",
          linkvisited: "#551A8B",
        },
      },
      fontFamily: {
        gothic: ["'Century Gothic'", "'Apple Gothic'", "'URW Gothic'", "sans-serif"],
        display: ["'Retro Display'", "'Century Gothic'", "sans-serif"],
      },
      maxWidth: {
        retro: "1000px",
      },
    },
  },
  plugins: [],
}
