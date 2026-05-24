module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    clientKey: process.env.TOSS_CLIENT_KEY || "",
    ready: Boolean(process.env.TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY)
  });
};
