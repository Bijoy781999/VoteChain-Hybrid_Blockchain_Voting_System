/**
 * Prevents read-only explorer/demo accounts from executing state-changing actions
 * while allowing full read/GET inspection of all portal pages and options.
 */
const blockReadOnlyAccount = (req, res, next) => {
  if (req.user && req.user.isReadOnly) {
    return res.status(403).json({
      success: false,
      message:
        "Read-Only Explorer Account: This default preview account is restricted to exploring portal pages and available options. Actions and modifications are disabled.",
    });
  }
  next();
};

module.exports = blockReadOnlyAccount;
