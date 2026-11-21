-- Temucraft: issues and feature requests (?issues)
--   aowow_issues         one bug or feature request; kind 1 bug, 2 feature request; status 0 open, 1 planned, 2 fixed, 3 won't fix
--   aowow_issue_replies  staff replies; newStatus is the status the reply set (NULL: none)
CREATE TABLE IF NOT EXISTS `aowow_issues` (
  `id`      int unsigned     NOT NULL AUTO_INCREMENT,
  `userId`  int unsigned     NOT NULL COMMENT 'aowow_account.id',
  `kind`    tinyint unsigned NOT NULL DEFAULT 1,
  `status`  tinyint unsigned NOT NULL DEFAULT 0,
  `title`   varchar(160)     NOT NULL,
  `body`    text             NOT NULL,
  `created` int unsigned     NOT NULL DEFAULT 0,
  `updated` int unsigned     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `userId` (`userId`, `created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `aowow_issue_replies` (
  `id`        int unsigned     NOT NULL AUTO_INCREMENT,
  `issueId`   int unsigned     NOT NULL,
  `userId`    int unsigned     NOT NULL COMMENT 'aowow_account.id',
  `body`      text             NOT NULL,
  `created`   int unsigned     NOT NULL DEFAULT 0,
  `newStatus` tinyint unsigned NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `issueId` (`issueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELETE FROM `aowow_config` WHERE `key` IN ('issues_post_limit', 'issues_post_window', 'issues_post_gap');
INSERT INTO `aowow_config` (`key`, `value`, `default`, `cat`, `flags`, `comment`) VALUES
    ('issues_post_limit',  '3',    '3',    1, 129, 'issues and feature requests one user can post in issues_post_window seconds (staff: no limit)'),
    ('issues_post_window', '3600', '3600', 1, 129, 'seconds for issues_post_limit'),
    ('issues_post_gap',    '60',   '60',   1, 129, 'seconds a user waits between two posts on ?issues');
