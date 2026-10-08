import usePageTitle from "./usePageTitle";

// The game screen for one turn: big media frame, then the controls panel.
// Shared by the same-device game (GamePage) and online rooms (OnlineRoom), so
// it only renders what it is given and reports clicks back.
export default function TurnView({
  heading,
  round,
  numRounds,
  media,
  status,
  player1,
  player2,
  picked1,
  picked2,
  picked,
  canPick,
  canNext,
  canBack,
  backLabel = "Go back",
  nextLabel,
  locked = false,
  lockedText,
  onPick,
  onNext,
  onBack,
  onAdvance,
}) {
  const isFinalRound = round === numRounds;
  usePageTitle(`${heading} (round ${round} of ${numRounds})`);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="h-era !mb-0">{heading}</h2>
        <span className="font-bold">
          round {round} of {numRounds}{isFinalRound && " (final round, 5 songs)"}
        </span>
      </div>

      {media}

      <div className="box flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{status}</span>
          <span>
            {player1}: {picked1}/{numRounds} picked &nbsp;|&nbsp; {player2}: {picked2}/{numRounds} picked
          </span>
        </div>

        {locked ? (
          <div className="font-bold">{lockedText}</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!canPick} onClick={onPick} className="btn btn-lime btn-big">
              Pick this song
            </button>
            <button type="button" disabled={!canNext} onClick={onNext} className="btn btn-big">
              Next song
            </button>
            {canBack && (
              <button type="button" onClick={onBack} className="btn btn-big">
                {backLabel}
              </button>
            )}
            {picked && (
              <button type="button" onClick={onAdvance} className="btn btn-lime btn-big md:ml-auto">
                {nextLabel}
              </button>
            )}
          </div>
        )}

        {picked && (
          <div>
            {locked ? "They picked" : "You picked"} <b>{picked.name}</b>.
          </div>
        )}
      </div>
    </div>
  );
}
