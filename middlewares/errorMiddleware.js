const errorHandler = (err, req, res, next) => {
  res.json({
    message: err.message,
  });
};

export default errorHandler;
