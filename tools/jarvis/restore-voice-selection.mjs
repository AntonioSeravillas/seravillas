/* Restore identity only. Never roll back credentials, approved limits, usage or other private settings. */
export function restoreVoiceSelection(current,original){
  if(!current||!original||!/^\w{15,64}$/.test(original.voiceId||'')||!/^agent_[a-zA-Z0-9]{15,80}$/.test(original.liveAgentId||''))throw Error('The saved original Jarvis voice selection is invalid.');
  return {...current,voiceId:original.voiceId,liveAgentId:original.liveAgentId,voiceName:original.voiceName||'Jarvis Seravillas',soundTheme:'jarvis'};
}
