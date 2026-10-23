# Generate deterministic synthetic narration using an installed Windows voice; no microphone or network.
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../artifacts/speech-longform'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$fixtureDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
$paragraphs = @(
  'Today we are preparing a short video about a community garden. The opening scene introduces the project, shows the planting beds, and explains how volunteers share their work throughout the season.',
  'First we organize the source recordings. Clear file names help us find the interview, the wide camera angle, and the close view of the seedlings. Original recordings remain available for later changes.',
  'Next we create a simple timeline. Each selected clip has a beginning and an end. Moving a clip changes the sequence, while trimming its edges removes the parts we do not need.',
  'Our title explains the topic in a few readable words. A small logo appears in the corner. Neither element should cover the speaker or hide important details near the edge of the picture.',
  'The interview contains several pauses between ideas. We review the proposed cuts before applying them. A natural breath can stay, and a useful moment of silence can help the story feel clear.',
  'Captions make the spoken explanation easier to follow. We correct a mistaken word without changing its timing. The text should follow the edited footage even when a section is removed from the middle.',
  'Background music supports the story quietly. Its volume drops while a person speaks, then returns smoothly during a pause. Short fades at the beginning and end keep the sound comfortable for the audience.',
  'A gentle zoom can emphasize the new leaves or a useful tool. We choose a starting point and a duration, then keep the motion small. Too many effects can distract from the practical explanation.',
  'Before exporting we check the sequence again. The opening must identify the subject, the middle must show the process, and the ending must explain what happens next. Every important edit can be undone.',
  'Finally we save the project and export a review copy. We check that sound and picture finish together and that captions remain readable. This completes our local video editing and speech timing demonstration.'
)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
  if ($null -eq $voice) { throw 'Install an English Windows speech voice before generating this opt-in fixture.' }
  $synth.SelectVoice($voice.VoiceInfo.Name)
  $synth.Rate = 0
  $synth.SetOutputToWaveFile((Join-Path $fixtureDirectory 'narration.wav'))
  $body = ($paragraphs | ForEach-Object { '<p>' + [Security.SecurityElement]::Escape($_) + '</p><break time="1200ms"/>' }) -join ''
  $synth.SpeakSsml('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' + $body + '</speak>')
} finally { $synth.Dispose() }
($paragraphs -join "`n`n") | Set-Content -LiteralPath (Join-Path $fixtureDirectory 'narration.txt')
Write-Output 'Synthetic English speech fixture generated locally.'
