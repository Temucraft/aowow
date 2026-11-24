<?php
if (User::$id):
    echo '<span id="toplinks-favorites"><a class="hassubmenu"></a>|</span>';
    echo '<a id="toplinks-user">'.User::$displayName.'</a>';
    echo '<span id="toplinks-rep" title="'.Lang::main('reputationTip').'">(<a href="?reputation">'.User::getReputation().'</a>)</span>';
else:
    $here = preg_replace('/(^|&)urlloc=[a-z]+/', '', $_SERVER['QUERY_STRING'] ?? '');
    $next = $here && !preg_match('/^account(=|&|$)/i', $here) ? '&amp;next='.rawurlencode($here) : '';
    echo '<a href="?account=signin'.$next.'">'.Lang::main('signIn').'</a>';
endif;
?>
|<a href="#" id="toplinks-feedback" class="icon-email"><?=Lang::main('feedback'); ?></a>|<a href="javascript:;" id="toplinks-language"><?=Lang::main('language'); ?></a>
