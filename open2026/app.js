/**
 * ======================================================
 *   2026 MOONSHOT CUP -- Scoreboard App
 *   Moonshot CrossFit | moonshotcrossfit.com
 * ======================================================
 *
 * Plain JS -- no modules, no build step, no framework.
 * Polls a Lambda API for team/member data.
 * Captain login enables inline score editing.
 */

// -- Config --------------------------------------------------------
const API_URL = 'https://obp43wwmdk.execute-api.us-east-1.amazonaws.com';
const POLL_INTERVAL = 30000;   // 30 seconds

// -- Team metadata (static, matches the 4 captains) ----------------
const TEAM_META = {
  kevin: { name: 'Team Kevin', captain: 'Kevin Donnelly', color: '#EF4444', tw: 'red'    },
  molly: { name: 'Team Molly', captain: 'Molly Mevis',    color: '#3B82F6', tw: 'blue'   },
  kasia: { name: 'Team Kasia', captain: 'Kasia',          color: '#10B981', tw: 'emerald' },
  fuji:  { name: 'Team Fuji',  captain: 'Fuji',           color: '#F59E0B', tw: 'amber'  },
};

// -- Default challenges (used if API hasn't set them) ---------------
const DEFAULT_CHALLENGES = [
  { week: 1, title: 'Not a Water Bottle', desc: 'Bring anything but a water bottle to class. Most creative vessel wins 3 bonus pts (voted on Instagram).' },
  { week: 2, title: 'TBD', desc: 'Challenge announced Week 2.' },
  { week: 3, title: 'TBD', desc: 'Challenge announced Week 3.' },
];

// -- Application state ----------------------------------------------
let state = {
  teams: [],
  members: [],
  config: { currentWeek: 1, challenges: DEFAULT_CHALLENGES },
  authenticated: false,
  pin: null,
  captainTeamId: null,
  expandedTeams: new Set(),
  expandedMembers: new Set(),
  saving: new Set(),
  lastUpdated: null,
  searchQuery: '',
  highlightMember: null,
};

// -- Debounce timers for stepper inputs ------------------------------
const debounceTimers = {};


// ==================================================================
//  TEAM META HELPER
// ==================================================================

/**
 * Resolve team metadata regardless of whether teamId is 'kevin' or 'team-kevin'.
 */
function getTeamMeta(teamId) {
  const key = teamId?.replace('team-', '') || teamId;
  return TEAM_META[key] || { name: 'Unknown Team', captain: 'Unknown', color: '#6B7280', tw: 'gray' };
}


// ==================================================================
//  POINT CALCULATION (client-side, mirrors backend logic)
// ==================================================================

/**
 * Calculate total points for a single member from their scores object.
 */
function calcPoints(scores) {
  if (!scores) return 0;
  let pts = 0;

  // Open workouts (2 pts each, 3 max)
  if (scores.openWorkout1) pts += 2;
  if (scores.openWorkout2) pts += 2;
  if (scores.openWorkout3) pts += 2;

  // Judges Course (3 pts, once)
  if (scores.judgesCourse) pts += 3;

  // Judging others (1 pt each, no cap)
  pts += (scores.judgedCount || 0) * 1;

  // Growth: friends brought (3 each)
  pts += (scores.friendsBrought || 0) * 3;

  // Growth: friend signups
  pts += (scores.friendSignup5 || 0) * 5;
  pts += (scores.friendSignup10 || 0) * 10;
  pts += (scores.friendSignupMembership || 0) * 15;

  // Growth: Google review w/ photo (2 pts, once)
  if (scores.googleReview) pts += 2;

  // Growth: Social media (1 pt each, capped at 6)
  pts += Math.min(scores.socialMediaCount || 0, 6) * 1;

  // Fun: Weekly challenges (2 pts each)
  if (scores.weeklyChallenge1) pts += 2;
  if (scores.weeklyChallenge2) pts += 2;
  if (scores.weeklyChallenge3) pts += 2;

  // Fun: Weekly challenge winners (3 bonus each)
  if (scores.weeklyChallengeWinner1) pts += 3;
  if (scores.weeklyChallengeWinner2) pts += 3;
  if (scores.weeklyChallengeWinner3) pts += 3;

  // Misc bonus
  pts += (scores.bonusPoints || 0);

  return pts;
}

/**
 * Calculate total points for a team (all members + team name bonus).
 */
function calcTeamTotal(teamId) {
  const team = state.teams.find(t => t.teamId === teamId);
  const memberPts = state.members
    .filter(m => m.teamId === teamId)
    .reduce((sum, m) => sum + calcPoints(m.scores || {}), 0);
  const teamNameBonus = team?.teamNameSubmitted ? 3 : 0;
  return memberPts + teamNameBonus;
}

/**
 * Calculate capped points still available for a member.
 */
function calcPointsAvailable(scores) {
  let available = 0;
  if (!scores?.openWorkout1) available += 2;
  if (!scores?.openWorkout2) available += 2;
  if (!scores?.openWorkout3) available += 2;
  if (!scores?.judgesCourse) available += 3;
  if (!scores?.googleReview) available += 2;
  const socialRemaining = 6 - Math.min(scores?.socialMediaCount || 0, 6);
  available += socialRemaining;
  if (!scores?.weeklyChallenge1) available += 2;
  if (!scores?.weeklyChallenge2) available += 2;
  if (!scores?.weeklyChallenge3) available += 2;
  if (!scores?.weeklyChallengeWinner1) available += 3;
  if (!scores?.weeklyChallengeWinner2) available += 3;
  if (!scores?.weeklyChallengeWinner3) available += 3;
  return available;
}

/**
 * Build a list of things a member hasn't done yet.
 */
function getMissingActivities(scores) {
  const missing = [];
  if (!scores?.openWorkout1) missing.push('25.1 (2 pts)');
  if (!scores?.openWorkout2) missing.push('25.2 (2 pts)');
  if (!scores?.openWorkout3) missing.push('25.3 (2 pts)');
  if (!scores?.judgesCourse) missing.push('Judges Course (3 pts)');
  if (!scores?.googleReview) missing.push('Google Review (2 pts)');
  const socialUsed = Math.min(scores?.socialMediaCount || 0, 6);
  if (socialUsed < 6) missing.push(`Social posts (${6 - socialUsed} more)`);
  if (!scores?.weeklyChallenge1) missing.push('W1 Challenge (2 pts)');
  if (!scores?.weeklyChallenge2) missing.push('W2 Challenge (2 pts)');
  if (!scores?.weeklyChallenge3) missing.push('W3 Challenge (2 pts)');
  return missing;
}

/**
 * Ordinal suffix helper.
 */
function ordSuffix(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Get team completion summary for card header.
 */
function getTeamSummary(teamId) {
  const members = state.members.filter(m => m.teamId === teamId);
  const total = members.length;
  if (total === 0) return '';

  const w1 = members.filter(m => m.scores?.openWorkout1).length;
  const w2 = members.filter(m => m.scores?.openWorkout2).length;
  const w3 = members.filter(m => m.scores?.openWorkout3).length;
  const jc = members.filter(m => m.scores?.judgesCourse).length;
  const review = members.filter(m => m.scores?.googleReview).length;

  const parts = [];
  if (state.config.currentWeek >= 1) parts.push(`25.1: ${w1}/${total}`);
  if (state.config.currentWeek >= 2) parts.push(`25.2: ${w2}/${total}`);
  if (state.config.currentWeek >= 3) parts.push(`25.3: ${w3}/${total}`);
  parts.push(`Judges: ${jc}/${total}`);
  parts.push(`Reviews: ${review}/${total}`);
  return parts.join(' \u00b7 ');
}


// ==================================================================
//  API FUNCTIONS
// ==================================================================

/**
 * Fetch all scoreboard data from the API.
 */
async function fetchData() {
  try {
    const res = await fetch(`${API_URL}/data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.teams = data.teams || [];
    state.members = data.members || [];
    if (data.config) {
      state.config = {
        ...state.config,
        ...data.config,
        challenges: data.config.challenges?.length ? data.config.challenges : DEFAULT_CHALLENGES,
      };
    }
    // Auto-expand all teams so everyone can see rosters
    state.teams.forEach(t => state.expandedTeams.add(t.teamId));
    state.lastUpdated = Date.now();
    render();
  } catch (err) {
    console.warn('fetchData failed (API may not be deployed yet):', err.message);
    // If API is not available, use demo data so the page still looks good
    if (!state.teams.length) loadDemoData();
    state.teams.forEach(t => state.expandedTeams.add(t.teamId));
    state.lastUpdated = Date.now();
    render();
  }
}

/**
 * Authenticate with a team captain PIN.
 */
async function login(pin) {
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    state.authenticated = true;
    state.pin = pin;
    state.captainTeamId = data.teamId || null;
    render();
    return true;
  } catch (err) {
    console.warn('login failed:', err.message);
    return false;
  }
}

/**
 * Update a member's scores.
 */
async function updateScores(memberId, scores) {
  state.saving.add(memberId);
  renderSavingState(memberId);

  try {
    const res = await fetch(`${API_URL}/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.pin}`,
      },
      body: JSON.stringify({ memberId, scores }),
    });
    if (!res.ok) console.warn('updateScores failed:', res.status);
  } catch (err) {
    console.warn('updateScores error:', err.message);
  }

  // Update local state immediately for responsiveness
  const member = state.members.find(m => m.memberId === memberId);
  if (member) member.scores = { ...member.scores, ...scores };

  state.saving.delete(memberId);
  render();
}

/**
 * Update a team's custom name.
 */
async function updateTeamName(teamId, name) {
  try {
    await fetch(`${API_URL}/team-name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.pin}`,
      },
      body: JSON.stringify({ teamId, teamNameEntry: name }),
    });
  } catch (err) {
    console.warn('updateTeamName error:', err.message);
  }

  // Update local state
  const team = state.teams.find(t => t.teamId === teamId);
  if (team) {
    team.teamNameEntry = name;
    team.teamNameSubmitted = true;
  }
  render();
}

/**
 * Log out and clear auth state.
 */
function logout() {
  state.authenticated = false;
  state.pin = null;
  state.captainTeamId = null;
  state.expandedMembers.clear();
  render();
}


// ==================================================================
//  DEMO DATA (used when API is not yet deployed)
// ==================================================================

function loadDemoData() {
  state.teams = [
    { teamId: 'team-kevin', teamName: 'Team Kevin', teamNameEntry: '', teamNameSubmitted: false },
    { teamId: 'team-molly', teamName: 'Team Molly', teamNameEntry: '', teamNameSubmitted: false },
    { teamId: 'team-kasia', teamName: 'Team Kasia', teamNameEntry: '', teamNameSubmitted: false },
    { teamId: 'team-fuji',  teamName: 'Team Fuji',  teamNameEntry: '', teamNameSubmitted: false },
  ];

  state.members = [
    { memberId: 'kevin-donnelly',   teamId: 'team-kevin', name: 'Kevin Donnelly',   gender: 'M', scores: {} },
    { memberId: 'claire-chappell',  teamId: 'team-kevin', name: 'Claire Chappell',  gender: 'F', scores: {} },
    { memberId: 'colin-baer',       teamId: 'team-kevin', name: 'Colin Baer',       gender: 'M', scores: {} },
    { memberId: 'molly-mevis',      teamId: 'team-molly', name: 'Molly Mevis',      gender: 'F', scores: {} },
    { memberId: 'jessica-dorgan',   teamId: 'team-molly', name: 'Jessica Dorgan',   gender: 'F', scores: {} },
    { memberId: 'andrew-sheehan',   teamId: 'team-molly', name: 'Andrew Sheehan',   gender: 'M', scores: {} },
    { memberId: 'jillian-kashul',   teamId: 'team-kasia', name: 'Jillian Kashul',   gender: 'F', scores: {} },
    { memberId: 'katie-sink',       teamId: 'team-kasia', name: 'Katie Sink',       gender: 'F', scores: {} },
    { memberId: 'charlie-anderson', teamId: 'team-kasia', name: 'Charlie Anderson', gender: 'M', scores: {} },
    { memberId: 'christina-wagner', teamId: 'team-fuji',  name: 'Christina Wagner', gender: 'F', scores: {} },
    { memberId: 'james-galiger',    teamId: 'team-fuji',  name: 'James Galiger',    gender: 'M', scores: {} },
    { memberId: 'thomas-kashul',    teamId: 'team-fuji',  name: 'Thomas Kashul',    gender: 'M', scores: {} },
  ];
}


// ==================================================================
//  RENDERING
// ==================================================================

/**
 * Master render -- calls all sub-renders.
 */
function render() {
  renderEditBanner();
  renderWeekBadge();
  renderHeroSubtitle();
  renderLeaderboard();
  renderTeamCards();
  renderChallenge();
  renderLoginFab();
  renderLastUpdated();
}

/**
 * Show/hide the edit mode banner.
 */
function renderEditBanner() {
  const banner = document.getElementById('edit-banner');
  const body = document.body;
  if (state.authenticated) {
    const meta = state.captainTeamId ? getTeamMeta(state.captainTeamId) : null;
    const label = meta ? `Edit Mode — ${meta.name}` : 'Edit Mode Active';
    banner.querySelector('.edit-label').textContent = label;
    banner.classList.remove('hidden');
    body.classList.add('edit-active');
    body.style.paddingTop = '40px';
  } else {
    banner.classList.add('hidden');
    body.classList.remove('edit-active');
    body.style.paddingTop = '0';
  }
}

/**
 * Update the week badge in the hero.
 */
function renderWeekBadge() {
  const badge = document.getElementById('week-badge');
  if (badge) {
    badge.textContent = `Week ${state.config.currentWeek} of 3`;
  }
}

/**
 * Dynamic hero subtitle based on current week.
 */
function renderHeroSubtitle() {
  const el = document.querySelector('.hero-subtitle');
  if (!el) return;
  const week = state.config.currentWeek || 1;
  const subtitles = {
    1: 'The Open Starts Now',
    2: 'The Race Heats Up',
    3: 'Final Week \u2014 Every Point Counts'
  };
  el.textContent = subtitles[week] || subtitles[1];
}

/**
 * Hide login FAB when authenticated.
 */
function renderLoginFab() {
  const fab = document.getElementById('login-fab');
  if (fab) {
    fab.style.display = state.authenticated ? 'none' : 'flex';
  }
}

/**
 * Render the leaderboard as stacked rank cards.
 */
function renderLeaderboard() {
  const container = document.getElementById('leaderboard');
  if (!container) return;

  // Build sorted team data
  const teamData = state.teams.map(t => {
    const meta = getTeamMeta(t.teamId);
    const total = calcTeamTotal(t.teamId);
    const displayName = (t.teamNameEntry && t.teamNameSubmitted) ? t.teamNameEntry : (t.teamName || meta.name);
    const memberCount = state.members.filter(m => m.teamId === t.teamId).length;
    return { ...t, ...meta, total, displayName, memberCount };
  }).sort((a, b) => b.total - a.total);

  const leaderPts = teamData[0]?.total || 0;

  let html = '';

  // Zero-state message when all teams are at 0
  if (teamData.every(t => t.total === 0)) {
    html += `
      <div class="text-center py-8">
        <p class="text-gray-400 text-lg font-heading uppercase tracking-wider">Competition kicks off Feb 27</p>
        <p class="text-gray-500 text-sm mt-2">Check back for live standings</p>
      </div>
    `;
  }

  // Always show rank cards
  html += teamData.map((t, i) => {
    const rank = i + 1;
    const gap = leaderPts - t.total;
    let gapText = '';
    if (rank === 1) {
      gapText = (teamData[1] && teamData[1].total === t.total) ? 'Tied for 1st' : 'Leader';
    } else {
      gapText = gap === 0 ? `Tied for ${rank}${ordSuffix(rank)}` : `${gap} pts behind`;
    }

    return `
      <div class="flex items-center gap-4 p-4 md:p-5 rounded-xl bg-gray-900/80 border border-gray-700/50 ${rank === 1 ? 'leader-card-1' : ''}" style="animation: fadeUp 0.5s ease-out ${i * 100}ms both">
        <div class="rank-badge rank-${Math.min(rank, 4)}">${rank}</div>
        <div class="flex-1 min-w-0">
          <h3 class="font-heading text-lg md:text-xl font-black uppercase truncate" style="color: ${t.color}">${escHtml(t.displayName)}</h3>
          <p class="text-gray-500 text-xs">Captain: ${escHtml(t.captain)} \u00b7 ${t.memberCount} members \u00b7 <span class="text-gray-400">${gapText}</span></p>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="font-heading text-3xl md:text-4xl font-black" style="color: ${t.color}">${t.total}</span>
          <span class="block text-gray-500 text-[10px] font-semibold uppercase tracking-wider">pts</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

/**
 * Render the 4 team cards with rosters.
 */
function renderTeamCards() {
  const container = document.getElementById('team-cards');
  if (!container) return;

  // Sort teams by total descending
  const teamData = state.teams.map(t => {
    const meta = getTeamMeta(t.teamId);
    const total = calcTeamTotal(t.teamId);
    const members = state.members
      .filter(m => m.teamId === t.teamId)
      .sort((a, b) => calcPoints(b.scores || {}) - calcPoints(a.scores || {}));
    const displayName = (t.teamNameEntry && t.teamNameSubmitted) ? t.teamNameEntry : (t.teamName || meta.name);
    return { ...t, ...meta, total, members, displayName };
  }).sort((a, b) => b.total - a.total);

  container.innerHTML = teamData.map(t => {
    const expanded = state.expandedTeams.has(t.teamId);
    const summary = getTeamSummary(t.teamId);

    return `
      <div class="team-card bg-gray-900 rounded-xl overflow-hidden border-l-4 transition-all" style="border-color: ${t.color}">
        <!-- Card header (clickable to expand/collapse) -->
        <div
          class="team-header flex items-center justify-between p-5 cursor-pointer hover:bg-gray-800/40 transition-colors select-none"
          data-team="${t.teamId}"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-3 h-3 rounded-full flex-shrink-0" style="background: ${t.color}"></div>
            <div class="min-w-0 flex-1">
              <h3 class="font-heading text-lg font-bold text-white uppercase tracking-wide truncate">
                ${escHtml(t.displayName)}
              </h3>
              <p class="text-gray-400 text-xs">Captain: ${escHtml(t.captain)} &middot; ${t.members.length} members</p>
              ${summary ? `<p class="text-gray-600 text-[10px] mt-1 truncate">${summary}</p>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span class="font-heading text-2xl font-black" style="color: ${t.color}">${t.total}</span>
            <span class="text-gray-500 text-xs font-semibold uppercase">pts</span>
            <svg class="w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>
        </div>

        <!-- Roster (expandable) -->
        <div class="roster-panel ${expanded ? '' : 'hidden'} border-t border-gray-800">
          ${renderRoster(t)}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render the roster for a single team.
 * In edit mode, shows per-member accordions with inline controls.
 * In read-only mode, shows compact list with expandable detail.
 */
function renderRoster(team) {
  if (!team.members.length) {
    return '<p class="p-5 text-gray-500 text-sm">No members yet.</p>';
  }

  if (state.authenticated) {
    return renderEditRoster(team);
  }

  // Read-only roster with per-member expandable detail
  const rows = team.members.map((m, idx) => {
    const pts = calcPoints(m.scores || {});
    const badges = buildBadges(m.scores || {});
    const isExpanded = state.expandedMembers.has(m.memberId);
    const isHighlighted = state.highlightMember === m.memberId;
    const available = calcPointsAvailable(m.scores || {});
    const missing = getMissingActivities(m.scores || {});
    const bgClass = idx % 2 === 0 ? 'bg-gray-800/20' : '';

    return `
      <div class="border-t border-gray-800/50 ${bgClass} ${isHighlighted ? 'search-highlight' : ''}" data-member="${m.memberId}">
        <div class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/30 transition-colors" data-action="toggle-member" data-member-toggle="${m.memberId}">
          <span class="text-sm text-white font-medium">${escHtml(m.name)}</span>
          <div class="flex items-center gap-3">
            <span class="font-heading text-base font-bold" style="color: ${team.color}">${pts}</span>
            <span class="text-gray-600 text-[10px] uppercase">pts</span>
            <svg class="w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>
        </div>
        <div class="member-accordion ${isExpanded ? 'expanded' : 'collapsed'}">
          <div class="px-4 pb-3">
            <div class="flex flex-wrap gap-1 mb-2">${badges}</div>
            ${available > 0 ? `<p class="text-gray-500 text-[11px] mt-1"><span class="text-brand-gold font-semibold">${available} pts</span> still available (capped activities) + uncapped (judging, friends)</p>` : ''}
            ${missing.length > 0 ? `<p class="text-gray-600 text-[10px] mt-1">Not yet: ${missing.join(', ')}</p>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<div>${rows}</div>`;
}

/**
 * Build badge HTML for completed activities.
 */
function buildBadges(scores) {
  const badges = [];
  const b = (label, color) => `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-${color}-500/20 text-${color}-400 mr-1 mb-1">${label}</span>`;

  if (scores.openWorkout1) badges.push(b('25.1', 'blue'));
  if (scores.openWorkout2) badges.push(b('25.2', 'blue'));
  if (scores.openWorkout3) badges.push(b('25.3', 'blue'));
  if (scores.judgesCourse) badges.push(b('Judge Cert', 'blue'));
  if (scores.judgedCount > 0) badges.push(b(`Judged ${scores.judgedCount}`, 'blue'));
  if (scores.friendsBrought > 0) badges.push(b(`${scores.friendsBrought} friend${scores.friendsBrought > 1 ? 's' : ''}`, 'green'));
  if (scores.friendSignup5 > 0) badges.push(b(`${scores.friendSignup5} 5-pack`, 'green'));
  if (scores.friendSignup10 > 0) badges.push(b(`${scores.friendSignup10} 10-pack`, 'green'));
  if (scores.friendSignupMembership > 0) badges.push(b(`${scores.friendSignupMembership} membership`, 'green'));
  if (scores.googleReview) badges.push(b('Review', 'green'));
  if (scores.socialMediaCount > 0) badges.push(b(`${scores.socialMediaCount} social`, 'green'));
  if (scores.weeklyChallenge1) badges.push(b('W1 Challenge', 'yellow'));
  if (scores.weeklyChallenge2) badges.push(b('W2 Challenge', 'yellow'));
  if (scores.weeklyChallenge3) badges.push(b('W3 Challenge', 'yellow'));
  if (scores.weeklyChallengeWinner1) badges.push(b('W1 Winner', 'amber'));
  if (scores.weeklyChallengeWinner2) badges.push(b('W2 Winner', 'amber'));
  if (scores.weeklyChallengeWinner3) badges.push(b('W3 Winner', 'amber'));
  if (scores.bonusPoints > 0) badges.push(b(`+${scores.bonusPoints} bonus`, 'purple'));

  return badges.length ? badges.join('') : '<span class="text-gray-600 text-xs">No activity yet</span>';
}

/**
 * Render the edit-mode roster for a team (per-member accordions).
 */
function renderEditRoster(team) {
  // Team name input if not yet submitted
  let teamNameHtml = '';
  if (!team.teamNameSubmitted) {
    const currentVal = team.teamNameEntry ? escHtml(team.teamNameEntry) : '';
    teamNameHtml = `
      <div class="px-4 pt-4 pb-2">
        <p class="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-2">Team Name (3 pts by Mar 3)</p>
        <div class="flex gap-2">
          <input type="text" placeholder="Enter team name" value="${currentVal}"
            class="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/30 transition-colors"
            data-team="${team.teamId}" data-action="team-name-input">
          <button class="bg-brand-gold hover:bg-brand-gold/90 text-black font-bold px-4 py-2 rounded-lg text-sm font-heading uppercase tracking-wider transition-colors"
            data-action="submit-team-name" data-team="${team.teamId}">Submit</button>
        </div>
      </div>
    `;
  } else {
    teamNameHtml = `
      <div class="px-4 pt-4 pb-2 flex items-center gap-2">
        <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <span class="text-green-400 text-sm font-semibold">${escHtml(team.teamNameEntry || team.teamName || team.name)}</span>
        <span class="text-gray-600 text-xs">(+3 pts)</span>
      </div>
    `;
  }

  const rows = team.members.map((m, idx) => {
    const s = m.scores || {};
    const pts = calcPoints(s);
    const isSaving = state.saving.has(m.memberId);
    const isExpanded = state.expandedMembers.has(m.memberId);
    const bgClass = idx % 2 === 0 ? 'bg-gray-800/20' : '';

    return `
      <div class="${bgClass}" data-member="${m.memberId}">
        <!-- Compact member row (click to expand) -->
        <div class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/30 transition-colors" data-action="toggle-member-edit" data-member-toggle="${m.memberId}">
          <span class="text-white font-semibold text-sm">${escHtml(m.name)}</span>
          <div class="flex items-center gap-2">
            ${isSaving ? '<span class="saving-pulse text-amber-400 text-xs font-semibold">Saving...</span>' : ''}
            <span class="font-heading text-lg font-bold" style="color: ${team.color}">${pts} pts</span>
            <svg class="w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>
        </div>

        <!-- Expandable edit controls -->
        <div class="member-accordion ${isExpanded ? 'expanded' : 'collapsed'}">
          <div class="px-4 pb-4 border-t border-gray-800/30">
            <!-- Open section -->
            <div class="mb-3 mt-3">
              <p class="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-2">Open</p>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${renderToggle(m.memberId, 'openWorkout1', '25.1 Completed', s.openWorkout1)}
                ${renderToggle(m.memberId, 'openWorkout2', '25.2 Completed', s.openWorkout2)}
                ${renderToggle(m.memberId, 'openWorkout3', '25.3 Completed', s.openWorkout3)}
                ${renderToggle(m.memberId, 'judgesCourse', 'Judges Course', s.judgesCourse)}
              </div>
              <div class="mt-2">
                ${renderStepper(m.memberId, 'judgedCount', 'Times Judged', s.judgedCount || 0)}
              </div>
            </div>

            <!-- Growth section -->
            <div class="mb-3">
              <p class="text-[10px] uppercase tracking-widest text-green-400 font-bold mb-2">Growth</p>
              <div class="space-y-2">
                ${renderStepper(m.memberId, 'friendsBrought', 'Friends Brought', s.friendsBrought || 0)}
                ${renderStepper(m.memberId, 'friendSignup5', '5-Pack Signups', s.friendSignup5 || 0)}
                ${renderStepper(m.memberId, 'friendSignup10', '10-Pack Signups', s.friendSignup10 || 0)}
                ${renderStepper(m.memberId, 'friendSignupMembership', 'Membership Signups', s.friendSignupMembership || 0)}
                ${renderToggle(m.memberId, 'googleReview', 'Google Review w/ Photo', s.googleReview)}
                ${renderStepper(m.memberId, 'socialMediaCount', 'Social Media Posts', s.socialMediaCount || 0)}
              </div>
            </div>

            <!-- Fun section -->
            <div>
              <p class="text-[10px] uppercase tracking-widest text-yellow-400 font-bold mb-2">Fun</p>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${renderToggle(m.memberId, 'weeklyChallenge1', 'W1 Challenge', s.weeklyChallenge1)}
                ${renderToggle(m.memberId, 'weeklyChallengeWinner1', 'W1 Winner', s.weeklyChallengeWinner1)}
                ${renderToggle(m.memberId, 'weeklyChallenge2', 'W2 Challenge', s.weeklyChallenge2)}
                ${renderToggle(m.memberId, 'weeklyChallengeWinner2', 'W2 Winner', s.weeklyChallengeWinner2)}
                ${renderToggle(m.memberId, 'weeklyChallenge3', 'W3 Challenge', s.weeklyChallenge3)}
                ${renderToggle(m.memberId, 'weeklyChallengeWinner3', 'W3 Winner', s.weeklyChallengeWinner3)}
              </div>
              <div class="mt-2">
                ${renderStepper(m.memberId, 'bonusPoints', 'Bonus Points', s.bonusPoints || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<div>${teamNameHtml}<div class="border-t border-gray-800">${rows}</div></div>`;
}

/**
 * Render a toggle switch control.
 */
function renderToggle(memberId, field, label, value) {
  return `
    <div class="flex items-center justify-between gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
      <span class="text-gray-300 text-xs">${label}</span>
      <div
        class="toggle-track ${value ? 'active' : ''}"
        data-action="toggle"
        data-member="${memberId}"
        data-field="${field}"
        role="switch"
        aria-checked="${!!value}"
        tabindex="0"
      ></div>
    </div>
  `;
}

/**
 * Render a number stepper (+/- buttons).
 */
function renderStepper(memberId, field, label, value) {
  return `
    <div class="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
      <span class="text-gray-300 text-xs">${label}</span>
      <div class="flex items-center gap-2">
        <div
          class="stepper-btn bg-gray-700 text-gray-300 hover:bg-gray-600"
          data-action="decrement"
          data-member="${memberId}"
          data-field="${field}"
        >&minus;</div>
        <span class="text-white font-bold text-sm w-6 text-center" id="stepper-${memberId}-${field}">${value}</span>
        <div
          class="stepper-btn bg-gray-700 text-gray-300 hover:bg-gray-600"
          data-action="increment"
          data-member="${memberId}"
          data-field="${field}"
        >+</div>
      </div>
    </div>
  `;
}

/**
 * Render "Saving..." indicator on a specific member row.
 */
function renderSavingState(memberId) {
  // Saving state is handled on next full render via state.saving set
}

/**
 * Render the weekly challenge card.
 */
function renderChallenge() {
  const week = state.config.currentWeek || 1;
  const challenge = (state.config.challenges || DEFAULT_CHALLENGES).find(c => c.week === week)
    || DEFAULT_CHALLENGES[0];

  const titleEl = document.getElementById('challenge-title');
  const descEl = document.getElementById('challenge-desc');
  if (titleEl) titleEl.textContent = challenge.title;
  if (descEl) descEl.textContent = challenge.desc || challenge.description || '';
}

/**
 * Render the last-updated timestamp display.
 */
function renderLastUpdated() {
  const el = document.getElementById('last-updated');
  if (!el) return;
  if (!state.lastUpdated) {
    el.textContent = 'Loading...';
    return;
  }
  const diff = Math.floor((Date.now() - state.lastUpdated) / 1000);
  if (diff < 60) el.textContent = 'Updated just now';
  else if (diff < 3600) el.textContent = `Updated ${Math.floor(diff / 60)} min ago`;
  else el.textContent = `Updated ${Math.floor(diff / 3600)} hr ago`;
}


// ==================================================================
//  ATHLETE SEARCH
// ==================================================================

function initSearch() {
  const input = document.getElementById('athlete-search');
  if (!input) return;

  // Restore last search
  const saved = localStorage.getItem('mscf-cup-athlete');
  if (saved) {
    input.value = saved;
    // Auto-navigate to that athlete on load
    setTimeout(() => searchAthlete(saved), 500);
  }

  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    state.searchQuery = query;
    if (query.length >= 2) {
      localStorage.setItem('mscf-cup-athlete', query);
      searchAthlete(query);
    } else {
      localStorage.removeItem('mscf-cup-athlete');
      state.highlightMember = null;
      renderTeamCards();
    }
  });
}

function searchAthlete(query) {
  const lower = query.toLowerCase();
  const match = state.members.find(m => m.name.toLowerCase().includes(lower));
  if (match) {
    state.expandedTeams.add(match.teamId);
    state.highlightMember = match.memberId;
    renderTeamCards();
    // Scroll to the member
    setTimeout(() => {
      const el = document.querySelector(`[data-member="${match.memberId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}


// ==================================================================
//  EVENT HANDLERS
// ==================================================================

/**
 * Initialize all event listeners.
 */
function initEvents() {
  // -- Login FAB -> open modal -----------------------------------
  document.getElementById('login-fab').addEventListener('click', () => {
    document.getElementById('login-modal').classList.add('open');
    document.getElementById('pin-input').focus();
  });

  // -- Close modal -----------------------------------------------
  document.getElementById('login-close').addEventListener('click', closeLoginModal);
  document.getElementById('login-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // -- Login form submit -----------------------------------------
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('pin-input').value.trim();
    if (!pin) return;

    const success = await login(pin);
    if (success) {
      closeLoginModal();
    } else {
      // Shake animation + error message
      const box = document.getElementById('login-modal-box');
      const err = document.getElementById('login-error');
      box.classList.add('shake');
      err.classList.remove('hidden');
      setTimeout(() => box.classList.remove('shake'), 400);
      document.getElementById('pin-input').value = '';
      document.getElementById('pin-input').focus();
    }
  });

  // -- Logout button ---------------------------------------------
  document.getElementById('logout-btn').addEventListener('click', logout);

  // -- Event delegation: team card interactions -------------------
  document.getElementById('team-cards').addEventListener('click', (e) => {
    // Team header click -> toggle roster
    const header = e.target.closest('.team-header');
    if (header) {
      const teamId = header.dataset.team;
      if (state.expandedTeams.has(teamId)) {
        state.expandedTeams.delete(teamId);
      } else {
        state.expandedTeams.add(teamId);
      }
      renderTeamCards();
      return;
    }

    // Per-member accordion toggle (read-only mode)
    const memberToggle = e.target.closest('[data-action="toggle-member"]');
    if (memberToggle) {
      const memberId = memberToggle.dataset.memberToggle;
      if (state.expandedMembers.has(memberId)) {
        state.expandedMembers.delete(memberId);
      } else {
        state.expandedMembers.add(memberId);
      }
      renderTeamCards();
      return;
    }

    // Per-member accordion toggle (edit mode)
    const memberEditToggle = e.target.closest('[data-action="toggle-member-edit"]');
    if (memberEditToggle) {
      const memberId = memberEditToggle.dataset.memberToggle;
      if (state.expandedMembers.has(memberId)) {
        state.expandedMembers.delete(memberId);
      } else {
        state.expandedMembers.add(memberId);
      }
      renderTeamCards();
      return;
    }

    // Submit team name
    const submitNameBtn = e.target.closest('[data-action="submit-team-name"]');
    if (submitNameBtn && state.authenticated) {
      const teamId = submitNameBtn.dataset.team;
      const input = document.querySelector(`[data-action="team-name-input"][data-team="${teamId}"]`);
      if (input && input.value.trim()) {
        updateTeamName(teamId, input.value.trim());
      }
      return;
    }

    // Toggle switch click
    const toggle = e.target.closest('[data-action="toggle"]');
    if (toggle && state.authenticated) {
      handleToggle(toggle);
      return;
    }

    // Stepper click
    const stepper = e.target.closest('[data-action="increment"], [data-action="decrement"]');
    if (stepper && state.authenticated) {
      handleStepper(stepper);
      return;
    }
  });

  // -- Keyboard: toggle switches respond to Enter/Space ----------
  document.getElementById('team-cards').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="toggle"]')) {
      e.preventDefault();
      handleToggle(e.target);
    }
  });

  // -- Keyboard: team name submit on Enter -----------------------
  document.getElementById('team-cards').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-action="team-name-input"]')) {
      e.preventDefault();
      const teamId = e.target.dataset.team;
      if (e.target.value.trim() && state.authenticated) {
        updateTeamName(teamId, e.target.value.trim());
      }
    }
  });

  // -- Keyboard: Escape closes login modal -----------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLoginModal();
  });
}

/**
 * Handle a toggle switch change.
 */
function handleToggle(el) {
  const memberId = el.dataset.member;
  const field = el.dataset.field;
  const member = state.members.find(m => m.memberId === memberId);
  if (!member) return;

  const scores = { ...member.scores };
  scores[field] = !scores[field];
  member.scores = scores;

  // Re-render immediately for responsiveness, then push to API
  render();
  updateScores(memberId, scores);
}

/**
 * Handle a stepper increment/decrement with debouncing.
 */
function handleStepper(el) {
  const memberId = el.dataset.member;
  const field = el.dataset.field;
  const action = el.dataset.action;
  const member = state.members.find(m => m.memberId === memberId);
  if (!member) return;

  const scores = { ...member.scores };
  const current = scores[field] || 0;

  if (action === 'increment') {
    scores[field] = current + 1;
  } else if (action === 'decrement' && current > 0) {
    scores[field] = current - 1;
  } else {
    return; // Nothing to change
  }

  member.scores = scores;

  // Update the displayed count immediately
  const countEl = document.getElementById(`stepper-${memberId}-${field}`);
  if (countEl) countEl.textContent = scores[field];

  // Re-render points totals immediately
  renderLeaderboard();

  // Debounce the API call (300ms)
  const timerKey = `${memberId}-${field}`;
  clearTimeout(debounceTimers[timerKey]);
  debounceTimers[timerKey] = setTimeout(() => {
    updateScores(memberId, scores);
  }, 300);
}

/**
 * Close the login modal and reset its state.
 */
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
  document.getElementById('pin-input').value = '';
  document.getElementById('login-error').classList.add('hidden');
}


// ==================================================================
//  UTILITIES
// ==================================================================

/**
 * Escape HTML to prevent XSS.
 */
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ==================================================================
//  POLLING & INITIALIZATION
// ==================================================================

/**
 * Start data polling loop.
 */
async function startPolling() {
  await fetchData();
  setInterval(fetchData, POLL_INTERVAL);
}

/**
 * Boot the app.
 */
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  initSearch();
  startPolling();

  // Refresh the "last updated" display every 60 seconds
  setInterval(renderLastUpdated, 60000);
});
