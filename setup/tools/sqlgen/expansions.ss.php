<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

if (!CLI)
    die('not in cli mode');


/*
 * Temucraft: which expansion (or which part of our own content) items, NPCs, objects, quests, spells and the zones
 * of our maps come from. Reads setup/temucraft/expansions.json (made by setup/tools/temucraft-expansions.py from the
 * module SQL) and writes the `expansion` column. The items, creature, objects, quests, spell and zones steps call
 * applyTo() themselves after they rebuild their table, so this step is only needed when the JSON changed.
 */
CLISetup::registerSetup("sql", new class extends SetupScript
{
    public const FILE = 'setup/temucraft/expansions.json';

    protected $info = array(
        'expansions' => [[], CLISetup::ARGV_PARAM, 'Temucraft: applies setup/temucraft/expansions.json (expansion of items, NPCs, objects, quests, spells and our zones).']
    );

    protected $setupAfter = [['items', 'creature', 'objects', 'quests', 'spell', 'zones'], []];
    protected $inputFiles = [self::FILE];

    // json type => [setup step, table]
    private const TYPES = array(
        'item'   => ['items',    '?_items'],
        'npc'    => ['creature', '?_creature'],
        'object' => ['objects',  '?_objects'],
        'quest'  => ['quests',   '?_quests'],
        'spell'  => ['spell',    '?_spell']
    );

    private ?array $data = null;

    public function generate() : bool
    {
        $ok = true;
        foreach (array_merge(array_column(self::TYPES, 0), ['zones']) as $step)
            $ok = $this->applyTo($step, true) && $ok;

        return $ok;
    }

    // $reset: clear the column first (the table was not rebuilt, so old tags may linger)
    public function applyTo(string $step, bool $reset = false) : bool
    {
        if (!$this->load())
            return true;                                    // no file: nothing to tag

        try
        {
            if ($step == 'zones')
            {
                // the map's expansion from Map.dbc is the one the server lets players in with: show ours instead
                $byExp = [];
                foreach ($this->data['map'] ?? [] as $mapId => $exp)
                    $byExp[$exp][] = (int)$mapId;

                $n = 0;
                foreach ($byExp as $exp => $maps)
                    $n += DB::Aowow()->query('UPDATE ?_zones SET `expansion` = ?d WHERE `mapIdBak` IN (?a) OR `mapId` IN (?a)', $exp, $maps, $maps) ?: 0;

                CLI::write('[expansions] zones: '.$n.' zones on '.count($this->data['map'] ?? []).' maps', CLI::LOG_INFO);
                return true;
            }

            $type = $table = null;
            foreach (self::TYPES as $t => [$s, $tbl])
                if ($s == $step)
                    [$type, $table] = [$t, $tbl];

            if (!$type)
                return true;

            if ($reset)
                DB::Aowow()->query('UPDATE '.$table.' SET `expansion` = 0 WHERE `expansion` <> 0');

            $byExp = [];
            foreach ($this->data[$type] ?? [] as $id => $exp)
                $byExp[$exp][] = (int)$id;

            $n = 0;
            foreach ($byExp as $exp => $ids)
                foreach (array_chunk($ids, 5000) as $chunk)
                    $n += DB::Aowow()->query('UPDATE '.$table.' SET `expansion` = ?d WHERE `id` IN (?a)', $exp, $chunk) ?: 0;

            CLI::write('[expansions] '.$step.': '.$n.' of '.count($this->data[$type] ?? []).' tagged entries found', CLI::LOG_INFO);
        }
        catch (Exception $e)
        {
            CLI::write('[expansions] '.$step.': '.$e->getMessage().' (run php aowow --update for the expansion column)', CLI::LOG_ERROR);
            return false;
        }

        return true;
    }

    private function load() : bool
    {
        if ($this->data === null)
        {
            $this->data = [];
            if (file_exists(self::FILE))
            {
                $this->data = json_decode(file_get_contents(self::FILE), true) ?: [];
                if (!$this->data)
                    CLI::write('[expansions] '.self::FILE.' could not be read', CLI::LOG_WARN);
            }
        }

        return !!$this->data;
    }
});

?>
