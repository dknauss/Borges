<?php
// Stand-in LLM endpoint for the NLWeb WordPress plugin: records each prompt
// and answers every call with the same JSON, so the trace is deterministic.
$body = file_get_contents( 'php://input' );
file_put_contents( __DIR__ . '/prompts.jsonl', $body . "\n", FILE_APPEND );
$answer = array( 'score' => 90, 'description' => 'stub ranking', 'summary' => 'stub summary', 'requires_decontextualization' => 'False', 'decontextualized_query' => '' );
header( 'Content-Type: application/json' );
echo json_encode( array( 'content' => array( array( 'type' => 'text', 'text' => json_encode( $answer ) ) ) ) );
