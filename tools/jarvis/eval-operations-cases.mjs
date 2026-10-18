/* Fictional evaluation dialogues. Wording is deliberately varied and imperfect (missing words, fillers, repeats,
   self-corrections, misheard names). Expectations describe meaning and resulting state, never exact phrasing.
   `mock` is a reference decision used only by --mock to check the harness; real runs ignore it.
   Reference Sunday 18 October 2026: next week is Monday 19 – Sunday 25 October; the week after is 26 Oct – 1 Nov. */
export const REF='2026-10-18';
export function fixture(){
  return {
    props:[{id:'p-mar',name:'Villa Mar'},{id:'p-marjals',name:'Villa Marjals'},{id:'p-casa',name:'Casa Ejemplo'},{id:'p-finca',name:'Finca Prueba'}],
    cleaners:[{id:'c1',name:'Maribel'},{id:'c2',name:'Tanja'}],
    bookings:[
      {id:'b1',propId:'p-mar',guestName:'Fictional Guest One',checkIn:'2026-10-15',checkOut:'2026-10-20',status:'confirmed',linkedCleaningId:''},
      {id:'b2',propId:'p-marjals',guestName:'Fictional Guest Two',checkIn:'2026-10-18',checkOut:'2026-10-21',status:'confirmed',linkedCleaningId:''},
      {id:'b3',propId:'p-casa',guestName:'Fictional Guest Three',checkIn:'2026-10-19',checkOut:'2026-10-22',status:'confirmed',linkedCleaningId:'s1'},
      {id:'b4',propId:'p-finca',guestName:'Fictional Guest Four',checkIn:'2026-10-23',checkOut:'2026-10-28',status:'confirmed',linkedCleaningId:''},
      {id:'b5',propId:'p-mar',guestName:'Fictional Guest Five',checkIn:'2026-10-21',checkOut:'2026-10-24',status:'cancelled',linkedCleaningId:''},
      {id:'b6',propId:'p-casa',guestName:'Fictional Guest Six',checkIn:'2026-10-22',checkOut:'2026-10-25',status:'confirmed',linkedCleaningId:''},
      {id:'b7',propId:'p-marjals',guestName:'Fictional Guest Seven',checkIn:'2026-10-21',checkInTime:'16:00',checkOut:'2026-10-30',status:'confirmed',linkedCleaningId:''}],
    sessions:[
      {id:'s1',propId:'p-casa',date:'2026-10-22',time:'10:00',status:'scheduled',cleanerIds:[],note:'Checkout cleaning'},
      {id:'s2',propId:'p-casa',date:'2026-10-25',time:'09:30',status:'scheduled',cleanerIds:[],note:''}],
    tasks:[],issues:[]
  };
}
const NEXT={start:'2026-10-19',end:'2026-10-25'};
const ALL=['Finca Prueba 10:00','Villa Mar 10:00','Villa Marjals 10:00','Villa Marjals 10:00'];
const stays={kind:'records',query:{entity:'bookings',view:'list',period:'next_week'}};
const plan={kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'results'}};
export const CASES=[
  {id:'owner-example',about:'The owner’s own flow with revisions and a spoken go-ahead',turns:[
    {say:'Next week, what stays have we got?',expect:{records:{entity:'bookings',...NEXT,dateBy:'stay'}},mock:stays},
    {say:'ok put cleaning on the leaving days',expect:{plan:ALL,nothingSaved:true},mock:plan},
    {say:'not Marjals, only Mar',expect:{plan:['Villa Mar 10:00']},mock:{kind:'operation',operation:{action:'revise',onlyProperties:['Mar']}}},
    {say:'at ten... sorry, eleven',expect:{plan:['Villa Mar 11:00'],nothingSaved:true},mock:{kind:'operation',operation:{action:'revise',time:'11:00'}}},
    {say:'go ahead and create those cleanings',expect:{route:'app',saved:['Villa Mar 2026-10-20 11:00']}}]},
  {id:'arrivals',about:'“Coming” means arrivals; the follow-up uses that exact set',turns:[
    {say:'show me who is coming next week',expect:{records:{entity:'bookings',...NEXT,dateBy:'arrival'}},mock:{kind:'records',query:{entity:'bookings',view:'list',period:'next_week',dateBy:'arrival'}}},
    {say:'arrange cleaners after those guests go',expect:{plan:['Finca Prueba 10:00','Villa Marjals 10:00']},mock:plan}]},
  {id:'polite-and-remove',about:'Polite question as a request; drop the second item',turns:[
    {say:'bookings next week please',expect:{records:{entity:'bookings',...NEXT}},mock:stays},
    {say:'can you schedule the checkout cleans for these?',expect:{plan:ALL},mock:plan},
    {say:'leave that second one out',expect:{plan:['Finca Prueba 10:00','Villa Mar 10:00','Villa Marjals 10:00'],nothingSaved:true},mock:{kind:'operation',operation:{action:'revise',removeItems:[2]}}}]},
  {id:'broken-grammar',about:'Missing words, repetition and filler',turns:[
    {say:'uh what what bookings we got for the next week',expect:{records:{entity:'bookings',...NEXT}},mock:stays},
    {say:'cleaning for them when they going out, the checkout',expect:{plan:ALL},mock:plan}]},
  {id:'no-context',about:'A request with no booking scope asks which bookings and saves nothing',turns:[
    {say:'can you arrange the cleaning after they leave?',expect:{clarify:true,nothingSaved:true},mock:{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'results'}}},
    {say:'the ones for next week',expect:{plan:['Villa Mar 10:00','Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'dates',period:'next_week'}}}]},
  {id:'hypothetical',about:'A hypothetical is not a request',turns:[
    {say:'what would happen if we scheduled all the cleanings next week?',expect:{noOperation:true,nothingSaved:true},mock:{kind:'reply',text:'I would prepare a plan for review first.'}}]},
  {id:'negation',about:'A negated request is not a request',turns:[
    {say:"don't schedule anything for next week yet, I'm still waiting on the guests",expect:{noOperation:true,nothingSaved:true},mock:{kind:'reply',text:'Understood, nothing planned.'}}]},
  {id:'quoted',about:'Quoted words from someone else are not a request',turns:[
    {say:'Maribel wrote "schedule the cleanings for Friday", what do you think she means?',expect:{noOperation:true,nothingSaved:true},mock:{kind:'reply',text:'She may want Friday cleanings.'}}]},
  {id:'misheard-name',about:'A misheard property is resolved from the plan and stated',turns:[
    {say:'bookings for next week',expect:{records:{entity:'bookings',...NEXT}},mock:stays},
    {say:'do the checkout cleanings',expect:{plan:ALL},mock:plan},
    {say:'only the Marhals ones',expect:{plan:['Villa Marjals 10:00','Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'revise',onlyProperties:['Marhals']}}}]},
  {id:'lost-property',about:'Recognition lost the property name, so Jarvis asks',turns:[
    {say:'schedule the cleaning for villa... uh... on the checkout next week',expect:{clarify:true,nothingSaved:true},mock:{kind:'clarify',text:'Which villa?'}}]},
  {id:'self-correct-week',about:'Self-correction of the date scope',turns:[
    {say:'cleanings for next week checkouts, no wait, the week after',expect:{plan:['Finca Prueba 10:00','Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'dates',start:'2026-10-26',end:'2026-11-01'}}}]},
  {id:'direct-property',about:'Direct request naming one property, with repeats',turns:[
    {say:'schedule schedule the the cleaning for Villa Mar checkout next week',expect:{plan:['Villa Mar 10:00']},mock:{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'dates',period:'next_week',property:'Villa Mar'}}}]},
  {id:'option-reference',about:'“The second one” refers to the displayed booking list',turns:[
    {say:"what's on next week",expect:{records:{entity:'bookings'}},mock:stays},
    {say:'do the cleaning just for the second one',expect:{plan:['Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'options',options:[2]}}}]},
  {id:'team-and-time',about:'Team and time revisions on numbered items',turns:[
    {say:'next week bookings',expect:{records:{entity:'bookings',...NEXT}},mock:stays},
    {say:'plan the cleanings when they leave',expect:{plan:ALL},mock:plan},
    {say:'put Tanja on number one, and make that one half past eleven',expect:{plan:['Finca Prueba 10:00','Villa Mar 11:30 +Tanja','Villa Marjals 10:00','Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'revise',items:[1],cleaners:['Tanja'],time:'11:30'}}}]},
  {id:'cancel',about:'Cancelling drops the plan and saves nothing',turns:[
    {say:'bookings next week',expect:{records:{entity:'bookings'}},mock:stays},
    {say:'schedule cleanings for those',expect:{plan:ALL},mock:plan},
    {say:'forget it, cancel that',expect:{route:'app',nothingSaved:true}}]},
  {id:'vague-yes',about:'A vague yes never saves, whatever the model proposes',turns:[
    {say:'bookings next week',expect:{records:{entity:'bookings'}},mock:stays},
    {say:'cleanings for the checkouts please',expect:{plan:ALL},mock:plan},
    {say:'yeah looks good',expect:{nothingSaved:true},mock:{kind:'operation',operation:{action:'confirm'}}}]},
  {id:'count-confirm',about:'A confirmation with the right count saves the batch',turns:[
    {say:'which bookings next week',expect:{records:{entity:'bookings'}},mock:stays},
    {say:'put the cleanings in for when they check out',expect:{plan:ALL},mock:plan},
    {say:'only Mar and Marjals',expect:{plan:['Villa Mar 10:00','Villa Marjals 10:00','Villa Marjals 10:00']},mock:{kind:'operation',operation:{action:'revise',onlyProperties:['Mar','Marjals']}}},
    {say:'yes schedule those three',expect:{route:'app',saved:['Villa Mar 2026-10-20 10:00','Villa Marjals 2026-10-21 10:00','Villa Marjals 2026-10-30 10:00']}}]}
];
