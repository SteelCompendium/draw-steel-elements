// vue.config.js
module.exports = {
  css: {
    loaderOptions: {
      // applies to <style lang="sass">
      sass: {
        additionalData: `@import "~@/styles/variables.sass"`
      },
      // applies to <style lang="scss">
      scss: {
        additionalData: `@import "~@/styles/variables.scss";`
      }
    }
  }
};
