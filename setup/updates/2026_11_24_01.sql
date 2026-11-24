-- Temucraft: "Remember me" sign in. One row per remembered browser; the cookie holds selector:validator and only a
-- sha256 of the validator is kept here. Rows are dropped on sign out and when they run out.
CREATE TABLE IF NOT EXISTS `aowow_account_remember` (
  `selector` char(24)     NOT NULL,
  `userId`   int unsigned NOT NULL COMMENT 'aowow_account.id',
  `hash`     char(64)     NOT NULL,
  `expires`  int unsigned NOT NULL,
  PRIMARY KEY (`selector`),
  KEY `userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
