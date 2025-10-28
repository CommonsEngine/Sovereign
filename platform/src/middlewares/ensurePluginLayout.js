const ensurePluginLayout = (layout) => (req, res, next) => {
  res.locals.layout = res.locals.layout || layout;
  next();
};

export default ensurePluginLayout;
