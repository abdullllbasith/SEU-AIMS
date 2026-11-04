/**
 * Greetings and pleasantries need no routing, document search, web search or deep thinking.
 * Deliberately conservative: anything that could carry a real question falls through to the full pipeline.
 */
const SMALL_TALK = [
  /^(hi+|hello+|hey+|hiya|yo|hola|vanakkam|namaste|sup)( (there|buddy|friend|agent|tutor|bro|sir|madam))?$/,
  /^good (morning|afternoon|evening|night)( (there|agent|sir|madam))?$/,
  /^(how are you|how are you doing|how r u|how are u|how do you do|how is it going|how's it going|hows it going|how have you been)( (today|doing|now))?$/,
  /^(what'?s up|whats up|wassup|how('?s| is) your day)$/,
  /^(thanks|thank you|thank u|thx|ty|thanks a lot|thank you so much|many thanks|thanks a ton)( (agent|tutor|buddy))?$/,
  /^(ok|okay|k|cool|nice|great|good|fine|awesome|got it|understood|alright|sure|yes|no|yep|nope|hmm+)$/,
  /^(bye|goodbye|good bye|see you|see ya|take care|cya|ttyl)( (later|soon|tomorrow))?$/,
  /^(who are you|what are you|what is your name|what'?s your name|are you a bot|are you there)$/,
  /^(i'?m|i am) (fine|good|great|ok|okay|well)( (thanks|thank you))?$/,
];

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[!?.,;:~'"`’]+$/g, '')
    .replace(/^[!?.,;:~'"`’\s]+/g, '')
    .replace(/[!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSmallTalk(text) {
  const value = normalise(text);
  if (!value || value.length > 40) {
    return false;
  }
  return SMALL_TALK.some((pattern) => pattern.test(value));
}
