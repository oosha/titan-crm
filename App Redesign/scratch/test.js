


    // ── Email name tooltip ───────────────────────────────────────────────
    document.querySelectorAll('.account-email-text').forEach(emailText => {
      const tooltip = document.getElementById('email-tooltip');

      emailText.addEventListener('mouseenter', () => {
        const rect = emailText.getBoundingClientRect();
        tooltip.textContent = emailText.textContent.trim();
        tooltip.style.left = (rect.left - 4) + 'px';
        tooltip.style.top = (rect.top + rect.height / 2) + 'px';
        tooltip.style.display = 'block';
        emailText.style.opacity = '0';
      });

      emailText.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        emailText.style.opacity = '';
      });
    });





    function triggerRefresh(btn) {
      addNewEmail();
    }



    const NEW_EMAILS = [
      { sender: 'Rohan Mehta', subject: 'Design review for onboarding flow', preview: 'Hey, can we sync on the onboarding screens before EOD?' },
      { sender: 'Priya Nair', subject: 'Q3 metrics are in — looks great!', preview: 'Just pulled the numbers, we hit 94% retention this quarter.' },
      { sender: 'Arjun Sharma', subject: 'Quick question on the API spec', preview: 'Does the /refresh endpoint need auth headers or is it open?' },
      { sender: 'Meera Iyer', subject: 'Updated wireframes attached', preview: 'I have revised the flows based on last session feedback.' },
      { sender: 'Karan Bhatia', subject: 'Team lunch — Thursday works?', preview: 'Thinking the new place near the office, lmk if Thursday is ok.' },
    ];
    let newEmailIndex = 0;

    function addNewEmail() {
      const list = document.querySelector('.email-list');
      const data = NEW_EMAILS[newEmailIndex % NEW_EMAILS.length];
      newEmailIndex++;

      // Compute initials
      const parts = data.sender.split(' ');
      const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();

      // Determine avatar color class based on sender name length hash
      const colors = ['blue', 'orange', 'green', 'pink', 'purple'];
      const colorClass = 'avatar-' + colors[data.sender.length % colors.length];

      const tile = document.createElement('div');
      tile.className = 'email-tile new-email-tile';
      tile.innerHTML = `
    <div class="email-tile-inner" style="opacity:1;">
      <div class="tile-avatar ${colorClass}">${initials}<div class="avatar-dot"></div></div>
      <div class="tile-icons">
        <div class="tile-chk"><div class="chk"><img src="assets/392bf29c-08b1-44e8-b95b-b99905e722e6.svg" alt=""></div></div>
        <div class="tile-dot"></div>
        <div class="tile-star"><img src="assets/1e1696aa-5b8d-4409-97fd-4ce5c85c5ae5.svg" alt=""></div>
      </div>
      <div class="tile-content">
        <div style="display:flex;justify-content:space-between;">
          <div class="tile-sender bold">${data.sender}</div>
          <div class="tile-time">just now</div>
        </div>
        <div class="tile-subject">${data.subject}</div>
        <div class="tile-preview">${data.preview}</div>
        <div class="tile-hover-actions">
          <div class="tile-action-pill"><div class="icon18"><img src="assets/7c1d5199-2bce-428f-9bff-eb73b6954e12.svg" alt=""></div></div>
          <div class="tile-action-pill"><div class="icon18"><img src="assets/65a9156f-d37a-414e-bef2-e5b477cb6436.svg" alt=""></div></div>
        </div>
      </div>
    </div>
    <div class="tile-divider"><img src="assets/5a7cff96-86fc-4121-9127-08bc8d0621c7.svg" alt=""></div>`;

      // Instant append
      const overlay = list.querySelector('.refresh-overlay');
      if (overlay) overlay.after(tile);
    }



    function sweepSidebarNav(btn, isDone) {
      if (isDone) {
        const overlay = document.querySelector('.sidebar-folder-overlay');
        if (overlay) {
          overlay.classList.remove('sweeping');
        }
        return;
      }

      let accountHeader = null;
      if (btn) {
        accountHeader = btn.closest('.account-header');
      }
      if (!accountHeader) {
        const activeNavItem = document.querySelector('.nav-item.active');
        if (activeNavItem) {
          let prev = activeNavItem.previousElementSibling;
          while (prev) {
            if (prev.classList.contains('account-header')) {
              accountHeader = prev;
              break;
            }
            prev = prev.previousElementSibling;
          }
        }
      }
      if (!accountHeader) {
        accountHeader = document.querySelector('.account-header');
      }
      if (!accountHeader) return;

      // Collect the folder nav items for this account
      const items = [];
      let el = accountHeader.nextElementSibling;
      while (el && !el.classList.contains('sidebar-line') && !el.classList.contains('account-header')) {
        if (el.classList.contains('nav-item')) items.push(el);
        el = el.nextElementSibling;
      }
      if (!items.length) return;

      // Measure from the account-header bottom to the last nav-item bottom
      const navScroll = document.querySelector('.nav-scroll');
      const scrollRect = navScroll.getBoundingClientRect();
      const headerRect = accountHeader.getBoundingClientRect();
      const lastRect = items[items.length - 1].getBoundingClientRect();

      const topOffset = headerRect.bottom - scrollRect.top + navScroll.scrollTop;
      const height = lastRect.bottom - headerRect.bottom;

      // Create or reuse an overlay div
      let overlay = navScroll.querySelector('.sidebar-folder-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-folder-overlay';
        navScroll.appendChild(overlay);
      }

      overlay.style.top = topOffset + 'px';
      overlay.style.height = height + 'px';

      // Trigger animation
      overlay.offsetHeight;
      overlay.classList.add('sweeping');
    }

    // ── App Switcher ─────────────────────────────────────────────────────
    (function initAppSwitcher() {
      const tabSwitchBtn = document.querySelector('.tab-switch');
      const appSwitcher = document.getElementById('app-switcher');

      if (!tabSwitchBtn || !appSwitcher) return;

      tabSwitchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (appSwitcher.classList.contains('open')) {
          closeAppSwitcher();
        } else {
          openAppSwitcher();
        }
      });

      function openAppSwitcher() {
        tabSwitchBtn.classList.add('active');
        appSwitcher.style.display = 'block';
        // Trigger reflow
        appSwitcher.offsetHeight;
        appSwitcher.classList.add('open');
      }

      function closeAppSwitcher() {
        tabSwitchBtn.classList.remove('active');
        appSwitcher.classList.remove('open');
        // Wait for transition to end before setting display none
        const onTransitionEnd = (e) => {
          if (e.propertyName === 'opacity' && !appSwitcher.classList.contains('open')) {
            appSwitcher.style.display = 'none';
            appSwitcher.removeEventListener('transitionend', onTransitionEnd);
          }
        };
        appSwitcher.addEventListener('transitionend', onTransitionEnd);
      }

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (appSwitcher.classList.contains('open') && !appSwitcher.contains(e.target) && !tabSwitchBtn.contains(e.target)) {
          closeAppSwitcher();
        }
      });
    })();

    // ── Composer ────────────────────────────────────────────────────────
    function openComposer() {
      const w = document.getElementById('composer-window');
      w.classList.remove('comp-minimized');
      w.classList.add('comp-open');
      setTimeout(() => {
        const toInput = document.getElementById('comp-to-input');
        if (toInput) toInput.focus();
      }, 340);
    }

    function closeComposer() {
      const w = document.getElementById('composer-window');
      w.classList.remove('comp-open', 'comp-minimized');
    }

    function toggleComposerMinimize() {
      const w = document.getElementById('composer-window');
      if (!w.classList.contains('comp-open')) return;
      w.classList.toggle('comp-minimized');
    }

    // Tab switching and refresh animation logic
    document.addEventListener('DOMContentLoaded', () => {
      const tabItems = document.querySelectorAll('.tabs-row .tab-item');
      tabItems.forEach(tab => {
        tab.addEventListener('click', (e) => {
          tabItems.forEach(t => {
            const label = t.querySelector('.tab-item-label');
            if (label) label.classList.add('inactive');
            const underline = t.querySelector('.tab-item-underline');
            if (underline) underline.remove();
          });
          
          const activeLabel = tab.querySelector('.tab-item-label');
          if (activeLabel) activeLabel.classList.remove('inactive');
          
          // Append underline if not exists
          if (!tab.querySelector('.tab-item-underline')) {
            const underline = document.createElement('div');
            underline.className = 'tab-item-underline';
            tab.appendChild(underline);
          }
          
          const emailList = document.querySelector('.email-list');
          if (emailList) {
            emailList.classList.add('fade-refresh');
            setTimeout(() => {
              emailList.classList.remove('fade-refresh');
            }, 300);
          }
        });
      });
    });


    // Populate the collapsed-inbox unread badge and total count.
    function updateUnreadBadge() {
      const badge = document.querySelector('.compact-unread-badge');
      const total = document.querySelector('.compact-total-count');
      const unread = document.querySelectorAll('.email-list .email-tile .tile-dot').length;
      const totalCount = document.querySelectorAll('.email-list .email-tile').length;
      if (badge) badge.textContent = unread > 99 ? '99+' : (unread || '');
      if (total) total.textContent = totalCount || '';
    }
    window.addEventListener('load', updateUnreadBadge);
    updateUnreadBadge();

    function toggleSidebar() {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.toggle('collapsed');
      if (typeof sweepSidebarNav === 'function') sweepSidebarNav(null, true);
    }

    // The card caps its width when the inbox is collapsed (1000px) and
    // otherwise fills the row. Using `max-width: 100%` left slack (the
    // flex-resolved width is smaller than 100%), so the cap animation had
    // a dead-zone and ran at a different visual pace than the inbox width
    // animation. Driving max-width as an exact pixel value removes the
    // slack so every collapse/expand shares one easing and one pace.
    const TASKS_W_COLLAPSED = 56;
    const TASKS_W_OPEN = 334;
    const CARD_COLLAPSED_MAXWIDTH = 1000;
    // Middle panel (440) + reading pane max-width (1000) — card never
    // grows wider than content can fill, preventing whitespace on 2K+.
    const CARD_EXPANDED_MAXWIDTH = 1440;

    function updateCardMaxWidth(animate) {
      const card = document.querySelector('.main-content-card');
      const contentArea = document.querySelector('.content-area');
      const tasks = document.querySelector('.tasks-panel');
      if (!card || !contentArea) return;

      if (!animate) card.style.transition = 'none';

      if (card.classList.contains('mp-collapsed')) {
        card.style.maxWidth = CARD_COLLAPSED_MAXWIDTH + 'px';
      } else {
        const cs = getComputedStyle(contentArea);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const avail = contentArea.clientWidth - padL - padR;
        card.style.maxWidth = Math.min(Math.max(0, avail), CARD_EXPANDED_MAXWIDTH) + 'px';
      }

      if (!animate) {
        void card.offsetWidth; // flush, then restore the transition
        card.style.transition = '';
      }
    }

    function toggleMiddlePanel() {
      const mp = document.querySelector('.middle-panel');
      if (mp) mp.classList.toggle('mp-collapsed');
      const card = document.querySelector('.main-content-card');
      if (card) card.classList.toggle('mp-collapsed');
      updateCardMaxWidth(true);
    }

    window.addEventListener('load', () => updateCardMaxWidth(false));
    window.addEventListener('resize', () => updateCardMaxWidth(false));
    requestAnimationFrame(() => updateCardMaxWidth(false));

    // ── Tasks Side Panel Toggle ──────────────────────────────────────────
    (function initTasksPanel() {
      const tasksToggleBtn = document.getElementById('tasks-toggle-btn');
      const tasksPanel = document.getElementById('tasks-panel');

      if (!tasksToggleBtn || !tasksPanel) return;

      function setPanelState(open) {
        tasksPanel.classList.toggle('tasks-open', open);
        const contentArea = document.querySelector('.content-area');
        if (contentArea) {
          contentArea.style.paddingRight = open ? '366px' : '16px';
        }
        if (tasksToggleBtn) {
          tasksToggleBtn.classList.toggle('active', open);
        }
        if (typeof trackComposeSearch === 'function') trackComposeSearch();
        if (typeof updateCardMaxWidth === 'function') updateCardMaxWidth(true);
      }

      tasksToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentlyOpen = tasksPanel.classList.contains('tasks-open');
        setPanelState(!currentlyOpen);
      });

      // Close panel if clicked outside
      document.addEventListener('click', (e) => {
        if (tasksPanel.classList.contains('tasks-open') && !tasksPanel.contains(e.target) && !tasksToggleBtn.contains(e.target)) {
          setPanelState(false);
        }
      });
    })();

    // Sidebar tab switcher function
    function switchSidebarTab(tabName) {
      const tabs = document.querySelectorAll('.tasks-tab-item');
      tabs.forEach(t => {
        t.classList.toggle('active', t.textContent.trim().toLowerCase() === tabName);
      });
      
      const paneCalendar = document.getElementById('pane-calendar');
      const paneTasks = document.getElementById('pane-tasks');
      if (paneCalendar) paneCalendar.classList.toggle('active', tabName === 'calendar');
      if (paneTasks) paneTasks.classList.toggle('active', tabName === 'tasks');
    }

    // ─────────────────────────────────────────────────────────────────────





    // Folder switcher functions
    function toggleFolderDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById('folder-dropdown');
      dropdown.classList.toggle('show');
    }

    function selectFolder(folderName) {
      document.getElementById('current-folder-text').innerText = folderName;
      
      // Update active dropdown item
      const dropdownItems = document.querySelectorAll('.folder-dropdown-item');
      dropdownItems.forEach(item => {
        const text = item.querySelector('span').innerText;
        if (text === folderName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Update leftmost sidebar active item to match for demo consistency
      const sidebarItems = document.querySelectorAll('.nav-scroll .nav-item');
      sidebarItems.forEach(item => {
        const label = item.querySelector('.nav-item-label');
        if (label) {
          const text = label.innerText.trim();
          if (text === folderName) {
            item.classList.add('active');
            label.classList.add('active');
          } else {
            item.classList.remove('active');
            label.classList.remove('active');
          }
        }
      });
    }

    // Close folder dropdown on outside clicks
    window.addEventListener('click', () => {
      const dropdown = document.getElementById('folder-dropdown');
      if (dropdown && dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
      }
    });

  