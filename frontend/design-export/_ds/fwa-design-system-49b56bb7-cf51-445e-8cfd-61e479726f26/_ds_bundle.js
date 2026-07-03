/* @ds-bundle: {"format":3,"namespace":"FWADesignSystem_49b56b","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"StatCard","sourcePath":"components/core/StatCard.jsx"},{"name":"StatusChip","sourcePath":"components/core/StatusChip.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f16798e1f983","components/core/Button.jsx":"5b5e78bffc92","components/core/Card.jsx":"3ac498ae611f","components/core/Eyebrow.jsx":"0f4bf7ae80da","components/core/Input.jsx":"582d8c15df84","components/core/StatCard.jsx":"5fe0ac9f1d4e","components/core/StatusChip.jsx":"6b542e4739fd","ui_kits/app/App.jsx":"51cbfc8131c2","ui_kits/app/Dashboard.jsx":"99692d54fef4","ui_kits/app/Shell.jsx":"b56f8745a7d5","ui_kits/marketing/DeepBand.jsx":"808ecd8301db","ui_kits/marketing/Footer.jsx":"4921086b0a5e","ui_kits/marketing/Hero.jsx":"c9f08df538fd","ui_kits/marketing/Home.jsx":"15fa4821debe","ui_kits/marketing/Nav.jsx":"a935587beab8","ui_kits/marketing/Pricing.jsx":"a0c9fb978225","ui_kits/marketing/Services.jsx":"a8b0a80e3491"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FWADesignSystem_49b56b = window.FWADesignSystem_49b56b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA Badge — small static label. Tones: neutral, teal, ink, outline.
 */
function Badge({
  tone = 'teal',
  children,
  style = {},
  ...rest
}) {
  const tones = {
    teal: {
      background: 'var(--mist)',
      color: 'var(--teal-700)',
      border: '1px solid transparent'
    },
    neutral: {
      background: 'var(--cloud)',
      color: 'var(--text-body)',
      border: '1px solid transparent'
    },
    ink: {
      background: 'var(--ink)',
      color: 'var(--on-dark)',
      border: '1px solid transparent'
    },
    outline: {
      background: 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--border-strong)'
    }
  };
  const t = tones[tone] || tones.teal;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.4px',
      textTransform: 'uppercase',
      padding: '3px 9px',
      borderRadius: 'var(--r-pill)',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA Button — teal pill CTAs and companions.
 * Variants: primary (teal fill), secondary (outlined pill), text (plain teal link).
 */
function Button({
  variant = 'primary',
  size = 'md',
  href,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  children,
  style = {},
  ...rest
}) {
  const pads = {
    sm: variant === 'text' ? '6px 0' : '8px 16px',
    md: variant === 'text' ? '8px 0' : '12px 22px',
    lg: variant === 'text' ? '10px 0' : '15px 28px'
  };
  const fontSize = size === 'lg' ? 15 : 14;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize,
    letterSpacing: '0.1px',
    lineHeight: 1,
    padding: pads[size],
    borderRadius: variant === 'text' ? 0 : 'var(--r-pill)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    border: '1px solid transparent',
    transition: 'background-color .15s ease, border-color .15s ease, color .15s ease',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box'
  };
  const variants = {
    primary: {
      background: 'var(--action)',
      color: 'var(--on-dark)'
    },
    secondary: {
      background: 'transparent',
      color: 'var(--ink)',
      borderColor: 'var(--border-strong)'
    },
    text: {
      background: 'transparent',
      color: 'var(--action)',
      padding: pads[size]
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyle = !disabled && hover ? {
    primary: {
      background: 'var(--action-hover)'
    },
    secondary: {
      background: 'var(--mist)',
      borderColor: 'var(--teal-300)'
    },
    text: {
      color: 'var(--action-hover)'
    }
  }[variant] : {};
  const props = {
    style: {
      ...base,
      ...variants[variant],
      ...hoverStyle,
      ...style
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    'aria-disabled': disabled || undefined,
    ...rest
  };
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, iconLeft, children, iconRight);
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href
    }, props), content);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled
  }, props), content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA Card — flat, rounded, bordered surface. Depth from contrast, not shadow.
 * surface: canvas (white) | sand (warm) | mist (pale teal) | deep (teal-900 band).
 */
function Card({
  surface = 'canvas',
  radius = 'lg',
  padding = 28,
  bordered = true,
  children,
  style = {},
  ...rest
}) {
  const surfaces = {
    canvas: {
      background: 'var(--canvas)',
      color: 'var(--ink)'
    },
    sand: {
      background: 'var(--sand)',
      color: 'var(--ink)'
    },
    mist: {
      background: 'var(--mist)',
      color: 'var(--ink)'
    },
    deep: {
      background: 'var(--deep-band)',
      color: 'var(--on-dark)'
    }
  };
  const radii = {
    sm: 'var(--r-sm)',
    md: 'var(--r-md)',
    lg: 'var(--r-lg)',
    xl: 'var(--r-xl)'
  };
  const s = surfaces[surface] || surfaces.canvas;
  const showBorder = bordered && surface === 'canvas';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: s.background,
      color: s.color,
      borderRadius: radii[radius] || radii.lg,
      border: showBorder ? '1px solid var(--hairline)' : '1px solid transparent',
      padding: typeof padding === 'number' ? `${padding}px` : padding,
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA Eyebrow — uppercase mono section label. The system's signature labeling device.
 */
function Eyebrow({
  children,
  tone = 'action',
  style = {},
  ...rest
}) {
  const color = {
    action: 'var(--action)',
    muted: 'var(--text-muted)',
    onDark: 'var(--on-dark-muted)'
  }[tone] || 'var(--action)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      fontSize: 13,
      letterSpacing: '0.6px',
      textTransform: 'uppercase',
      color,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA Input — form field with label, hairline border, teal focus ring. Error state supported.
 */
function Input({
  label,
  hint,
  error,
  type = 'text',
  textarea = false,
  style = {},
  id,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const fieldId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? 'var(--error)' : focus ? 'var(--focus-ring)' : 'var(--hairline)';
  const fieldStyle = {
    width: '100%',
    fontFamily: 'var(--font-sans)',
    fontSize: 15,
    color: 'var(--ink)',
    background: 'var(--canvas)',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--r-md)',
    padding: '11px 13px',
    outline: focus ? '2px solid var(--focus-ring)' : 'none',
    outlineOffset: 2,
    boxSizing: 'border-box',
    transition: 'border-color .15s ease',
    resize: textarea ? 'vertical' : undefined
  };
  const Field = textarea ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--ink)'
    }
  }, label), /*#__PURE__*/React.createElement(Field, _extends({
    id: fieldId,
    type: textarea ? undefined : type,
    rows: textarea ? 4 : undefined,
    style: fieldStyle,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false)
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--error)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA StatCard — muted label above a Fraunces number. App dashboards, grids of 3–4.
 */
function StatCard({
  label,
  value,
  delta = null,
  deltaTone = 'success',
  style = {},
  ...rest
}) {
  const tone = {
    success: 'var(--success)',
    error: 'var(--error)',
    muted: 'var(--text-muted)'
  }[deltaTone] || 'var(--success)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)',
      padding: 20,
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginBottom: 10
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 28,
      letterSpacing: '-0.3px',
      color: 'var(--ink)',
      lineHeight: 1
    }
  }, value), delta != null && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: tone
    }
  }, delta)));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FWA StatusChip — pill chip using a semantic tint background + matching solid text.
 */
function StatusChip({
  status = 'success',
  children,
  style = {},
  ...rest
}) {
  const map = {
    success: {
      bg: 'var(--success-bg)',
      fg: 'var(--success)'
    },
    warning: {
      bg: 'var(--warning-bg)',
      fg: 'var(--warning)'
    },
    error: {
      bg: 'var(--error-bg)',
      fg: 'var(--error)'
    },
    info: {
      bg: 'var(--info-bg)',
      fg: 'var(--info)'
    },
    neutral: {
      bg: 'var(--cloud)',
      fg: 'var(--text-body)'
    }
  };
  const c = map[status] || map.success;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: c.bg,
      color: c.fg,
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
      padding: '4px 10px',
      borderRadius: 'var(--r-pill)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: c.fg
    }
  }), children);
}
Object.assign(__ds_scope, { StatusChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusChip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/App.jsx
try { (() => {
// FWA web app — composition. Sidebar nav switches the title; dashboard is the main view.
function App() {
  const [active, setActive] = React.useState('Dashboard');
  return /*#__PURE__*/React.createElement(Shell, {
    active: active,
    setActive: setActive,
    title: active,
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "sm",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 16,
        color: "#fff"
      })
    }, "New project")
  }, /*#__PURE__*/React.createElement(Dashboard, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Dashboard.jsx
try { (() => {
// FWA web app — dashboard content: stat grid + projects data table.
const ROWS = [{
  name: 'Northwind storefront',
  client: 'Northwind Co.',
  stage: 'In build',
  status: 'info',
  due: 'Jul 12',
  value: '$9,000'
}, {
  name: 'Lumen marketing site',
  client: 'Lumen Labs',
  stage: 'Live',
  status: 'success',
  due: 'Shipped',
  value: '$4,000'
}, {
  name: 'Parcel dashboard',
  client: 'Parcel',
  stage: 'Design',
  status: 'neutral',
  due: 'Jul 20',
  value: '$14,000'
}, {
  name: 'Harborview redesign',
  client: 'Harborview',
  stage: 'Review due',
  status: 'warning',
  due: 'Jun 30',
  value: '$6,500'
}, {
  name: 'Mintleaf checkout',
  client: 'Mintleaf',
  stage: 'Overdue',
  status: 'error',
  due: 'Jun 24',
  value: '$7,200'
}];
function Dashboard() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Active projects",
    value: "14",
    delta: "+3"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Revenue booked",
    value: "$48.2k",
    delta: "+12%"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Avg. load time",
    value: "0.8s",
    delta: "-0.2s",
    deltaTone: "success"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Overdue",
    value: "2",
    delta: "+1",
    deltaTone: "error"
  })), /*#__PURE__*/React.createElement(Card, {
    surface: "canvas",
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 24px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 17,
      color: 'var(--ink)',
      margin: 0
    }
  }, "Projects"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      margin: '4px 0 0'
    }
  }, "5 active \xB7 2 need attention")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "sliders-horizontal",
      size: 15,
      color: "var(--ink)"
    })
  }, "Filter"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 16,
      color: "#fff"
    })
  }, "New project"))), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Project', 'Client', 'Stage', 'Due', 'Value', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: {
      textAlign: i >= 4 && i < 5 ? 'right' : 'left',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '.5px',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      fontWeight: 500,
      padding: '12px 24px'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, ROWS.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.name,
    style: {
      borderTop: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--ink)'
    }
  }, r.name), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px',
      fontSize: 14,
      color: 'var(--text-body)'
    }
  }, r.client), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px'
    }
  }, /*#__PURE__*/React.createElement(StatusChip, {
    status: r.status
  }, r.stage)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px',
      fontSize: 14,
      color: 'var(--text-body)'
    }
  }, r.due), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px',
      fontSize: 14,
      color: 'var(--ink)',
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums'
    }
  }, r.value), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '16px 24px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more-horizontal",
    size: 18,
    color: "var(--text-muted)"
  })))))))));
}
Object.assign(window, {
  Dashboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Shell.jsx
try { (() => {
// FWA web app — shell (ink sidebar + top bar) and shared helpers.
const {
  Button,
  Eyebrow,
  Badge,
  Card,
  StatusChip,
  StatCard,
  Input
} = window.FWADesignSystem_49b56b;
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  stroke = 1.75,
  style = {}
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          stroke: color,
          'stroke-width': stroke
        }
      });
    }
  }, [name, size, color, stroke]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: 'inline-flex',
      ...style
    }
  });
}
const NAV = [{
  icon: 'layout-dashboard',
  label: 'Dashboard'
}, {
  icon: 'folder-kanban',
  label: 'Projects'
}, {
  icon: 'users',
  label: 'Clients'
}, {
  icon: 'file-text',
  label: 'Invoices'
}, {
  icon: 'bar-chart-3',
  label: 'Analytics'
}];
function Sidebar({
  active,
  setActive
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 248,
      flex: 'none',
      background: 'var(--ink)',
      color: 'var(--on-dark)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 16px',
      height: '100vh',
      position: 'sticky',
      top: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 8px 22px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fwa-app-icon-teal.svg",
    alt: "FWA",
    style: {
      width: 32,
      height: 32,
      borderRadius: 8
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 20,
      letterSpacing: '-.3px'
    }
  }, "Francis")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, NAV.map(n => {
    const on = active === n.label;
    return /*#__PURE__*/React.createElement("button", {
      key: n.label,
      onClick: () => setActive(n.label),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 'var(--r-md)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: on ? 'var(--teal-800)' : 'transparent',
        color: on ? '#fff' : 'var(--on-dark-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: on ? 600 : 500,
        position: 'relative'
      }
    }, on && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 0,
        top: 8,
        bottom: 8,
        width: 3,
        borderRadius: 3,
        background: 'var(--teal-400)'
      }
    }), /*#__PURE__*/React.createElement(Icon, {
      name: n.icon,
      size: 19,
      color: on ? 'var(--teal-300)' : 'var(--on-dark-muted)'
    }), n.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 8px',
      borderTop: '1px solid var(--ink-soft)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: '50%',
      background: 'var(--teal-600)',
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 600
    }
  }, "JR"), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#fff'
    }
  }, "Jordan Rivera"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--on-dark-muted)'
    }
  }, "Owner"))));
}
function TopBar({
  title,
  action
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 72,
      flex: 'none',
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 28,
      letterSpacing: '-.4px',
      color: 'var(--ink)',
      margin: 0
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--cloud)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-pill)',
      padding: '8px 14px',
      width: 240
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, "Search\u2026")), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--r-md)',
      border: '1px solid var(--hairline)',
      background: 'var(--canvas)',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 18,
    color: "var(--ink)"
  })), action));
}
function Shell({
  active,
  setActive,
  title,
  action,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh'
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    active: active,
    setActive: setActive
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    title: title,
    action: action
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      padding: 32,
      flex: 1
    }
  }, children)));
}
Object.assign(window, {
  Button,
  Eyebrow,
  Badge,
  Card,
  StatusChip,
  StatCard,
  Input,
  Icon,
  Shell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/DeepBand.jsx
try { (() => {
// FWA marketing — deep teal "why us" band. The signature surface.
function DeepBand() {
  const stats = [{
    n: '0.8s',
    l: 'Median load time we ship'
  }, {
    n: '2.4×',
    l: 'Average lift in conversions'
  }, {
    n: '14 days',
    l: 'To a first working version'
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      width: MKT,
      margin: '0 auto 96px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--deep-band)',
      borderRadius: 'var(--r-xl)',
      padding: '72px 64px',
      color: 'var(--on-dark)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    tone: "onDark"
  }, "Why FWA"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 46,
      lineHeight: 1.1,
      letterSpacing: '-1px',
      margin: '16px 0 0'
    }
  }, "A pretty site that doesn\u2019t convert is just an expensive business card"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.55,
      color: 'var(--on-dark-muted)',
      marginTop: 20
    }
  }, "We build ones that pay for themselves. No jargon, no surprise invoices, no disappearing after launch \u2014 just fast, well-made web work backed by numbers you can check.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 32,
      marginTop: 56,
      borderTop: '1px solid rgba(153,230,214,.25)',
      paddingTop: 40
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 52,
      letterSpacing: '-1.5px',
      lineHeight: 1
    }
  }, s.n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: 'var(--on-dark-muted)',
      marginTop: 10
    }
  }, s.l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 44
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "#contact",
    style: {
      background: 'var(--canvas)',
      color: 'var(--ink)'
    }
  }, "Start a project"))));
}
Object.assign(window, {
  DeepBand
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/DeepBand.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Footer.jsx
try { (() => {
// FWA marketing — footer. Ink background, white labels, muted links, teal newsletter accent.
function Footer() {
  const cols = [{
    h: 'Services',
    items: ['Web design', 'Development', 'SEO', 'Web apps', 'Care plans']
  }, {
    h: 'Studio',
    items: ['Work', 'About', 'Process', 'Careers', 'Contact']
  }, {
    h: 'Resources',
    items: ['Blog', 'Guides', 'Pricing', 'FAQ']
  }];
  const muted = {
    color: 'var(--on-dark-muted)',
    textDecoration: 'none',
    fontSize: 14,
    display: 'block',
    padding: '5px 0'
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--ink)',
      color: 'var(--on-dark)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: MKT,
      margin: '0 auto',
      padding: '72px 0 40px',
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fwa-logo-horizontal-white.svg",
    alt: "Francis Web Agency",
    style: {
      height: 28
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.55,
      color: 'var(--on-dark-muted)',
      marginTop: 18,
      maxWidth: 260
    }
  }, "High-performing websites and custom web apps that help businesses grow."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 20
    }
  }, ['twitter', 'linkedin', 'github', 'dribbble'].map(s => /*#__PURE__*/React.createElement("a", {
    key: s,
    href: "#",
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--r-md)',
      background: 'var(--ink-soft)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s,
    size: 17,
    color: "var(--on-dark-muted)"
  }))))), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 8
    }
  }, c.h), c.items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    style: muted
  }, i))))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: MKT,
      margin: '0 auto',
      borderTop: '1px solid var(--ink-soft)',
      padding: '24px 0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--on-dark-muted)'
    }
  }, "\xA9 2026 Francis Web Agency. All rights reserved."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      ...muted,
      padding: 0
    }
  }, "Privacy"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      ...muted,
      padding: 0
    }
  }, "Terms"))));
}
Object.assign(window, {
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Hero.jsx
try { (() => {
// FWA marketing — hero. Big Fraunces headline over white, rounded media card.
function Hero() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      width: MKT,
      margin: '0 auto',
      padding: '72px 0 64px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      justifyContent: 'center'
    }
  }, "Web design & development studio"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 84,
      lineHeight: 1.02,
      letterSpacing: '-2px',
      color: 'var(--ink)',
      margin: '20px auto 0',
      maxWidth: 920,
      textWrap: 'balance'
    }
  }, "Websites that grow the business"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 19,
      lineHeight: 1.5,
      color: 'var(--text-body)',
      margin: '22px auto 0',
      maxWidth: 600
    }
  }, "Fast, modern sites and web apps that turn visitors into customers \u2014 without the agency runaround."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      justifyContent: 'center',
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "#contact"
  }, "Start a project"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    href: "#work"
  }, "See our work")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      marginTop: 56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%',
      background: 'var(--deep-band)',
      borderRadius: 'var(--r-xl)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      margin: '0 auto',
      width: 'min(960px, 100%)',
      aspectRatio: '16 / 8.4',
      borderRadius: 22,
      overflow: 'hidden',
      border: '1px solid var(--hairline)',
      background: 'var(--cloud)'
    }
  }, /*#__PURE__*/React.createElement(BrowserMock, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginBottom: 18
    }
  }, "Trusted by teams that ship"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 48,
      justifyContent: 'center',
      flexWrap: 'wrap',
      opacity: .55
    }
  }, ['Northwind', 'Lumen', 'Parcel', 'Harborview', 'Mintleaf'].map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 22,
      color: 'var(--ink)',
      letterSpacing: '-.5px'
    }
  }, n)))));
}

// Simple fake browser screenshot inside the hero card.
function BrowserMock() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 38,
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#E4E6E2'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#E4E6E2'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#E4E6E2'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 14,
      height: 20,
      flex: 1,
      maxWidth: 360,
      background: 'var(--cloud)',
      borderRadius: 'var(--r-pill)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: 'var(--canvas)',
      padding: '36px 44px',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      letterSpacing: '.6px',
      textTransform: 'uppercase',
      color: 'var(--action)'
    }
  }, "Case study 01"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 38,
      letterSpacing: '-1px',
      color: 'var(--ink)',
      marginTop: 12,
      maxWidth: 460,
      lineHeight: 1.08
    }
  }, "A storefront that doubled checkout"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 84,
      background: 'var(--sand)',
      borderRadius: 'var(--r-md)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 84,
      background: 'var(--mist)',
      borderRadius: 'var(--r-md)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 84,
      background: 'var(--cloud)',
      borderRadius: 'var(--r-md)'
    }
  }))));
}
Object.assign(window, {
  Hero
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Home.jsx
try { (() => {
// FWA marketing — page composition.
function Home() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Nav, null), /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(Services, null), /*#__PURE__*/React.createElement(DeepBand, null), /*#__PURE__*/React.createElement(Pricing, null), /*#__PURE__*/React.createElement(Contact, null), /*#__PURE__*/React.createElement(Footer, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Home, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Nav.jsx
try { (() => {
// FWA marketing — shared helpers + top nav. Exposes to window.
const {
  Button,
  Eyebrow,
  Badge,
  Card,
  StatusChip,
  StatCard,
  Input
} = window.FWADesignSystem_49b56b;

// Lucide icon helper — renders a thin-line icon by name.
function Icon({
  name,
  size = 22,
  color = 'currentColor',
  stroke = 1.75,
  style = {}
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({
        attrs: {
          width: size,
          height: size,
          stroke: color,
          'stroke-width': stroke
        }
      });
    }
  }, [name, size, color, stroke]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: 'inline-flex',
      ...style
    }
  });
}
const MKT = 'min(1200px, calc(100% - 80px))';

// Top announcement strip + nav.
function Nav() {
  const link = {
    fontSize: 15,
    color: 'var(--text-body)',
    textDecoration: 'none',
    fontWeight: 500
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: 'var(--canvas)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--ink)',
      color: 'var(--on-dark)',
      height: 38,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "Booking projects for Q3."), /*#__PURE__*/React.createElement("a", {
    href: "#contact",
    style: {
      color: 'var(--on-dark)',
      textDecoration: 'underline',
      textUnderlineOffset: 2
    }
  }, "Grab a slot \u2192")), /*#__PURE__*/React.createElement("nav", {
    style: {
      borderBottom: '1px solid var(--hairline)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 72,
      width: MKT,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fwa-logo-horizontal-ink.svg",
    alt: "Francis Web Agency",
    style: {
      height: 30
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 32,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#services",
    style: link
  }, "Services"), /*#__PURE__*/React.createElement("a", {
    href: "#work",
    style: link
  }, "Work"), /*#__PURE__*/React.createElement("a", {
    href: "#pricing",
    style: link
  }, "Pricing"), /*#__PURE__*/React.createElement("a", {
    href: "#about",
    style: link
  }, "About")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "text",
    size: "sm"
  }, "Sign in"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    href: "#contact"
  }, "Start a project"))));
}
Object.assign(window, {
  Button,
  Eyebrow,
  Badge,
  Card,
  StatusChip,
  StatCard,
  Input,
  Icon,
  MKT,
  Nav
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Pricing.jsx
try { (() => {
// FWA marketing — pricing (sand product cards) + contact form on a sand section.
const PLANS = [{
  name: 'Launch',
  price: '$4k',
  cadence: 'one-time',
  popular: false,
  blurb: 'A fast, modern marketing site to get the business online and converting.',
  features: ['Up to 6 pages', 'Custom design', 'SEO foundations', 'Launch in ~3 weeks']
}, {
  name: 'Growth',
  price: '$9k',
  cadence: 'one-time',
  popular: true,
  blurb: 'A bigger site plus the conversion and content work to make it pull its weight.',
  features: ['Up to 15 pages', 'CMS + blog', 'Conversion tuning', 'Analytics setup', '3 months support']
}, {
  name: 'Platform',
  price: 'Custom',
  cadence: 'project',
  popular: false,
  blurb: 'A custom web app or platform engineered to scale with the business.',
  features: ['Custom web app', 'User accounts & data', 'Built to handle 10x', 'Ongoing partnership']
}];
function Pricing() {
  return /*#__PURE__*/React.createElement("section", {
    id: "pricing",
    style: {
      background: 'var(--mist)',
      padding: '96px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: MKT,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      maxWidth: 620,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, {
    style: {
      justifyContent: 'center'
    }
  }, "Pricing"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 46,
      lineHeight: 1.1,
      letterSpacing: '-1px',
      color: 'var(--ink)',
      margin: '16px 0 0'
    }
  }, "Straight pricing, no surprises"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      color: 'var(--text-body)',
      marginTop: 16
    }
  }, "Pick a starting point. We\u2019ll scope the rest together before anyone signs anything.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 20,
      marginTop: 48,
      alignItems: 'start'
    }
  }, PLANS.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.name,
    surface: "sand",
    padding: 32,
    style: {
      position: 'relative',
      border: p.popular ? '1.5px solid var(--teal-400)' : '1px solid transparent',
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      letterSpacing: '.6px',
      textTransform: 'uppercase',
      color: 'var(--ink)'
    }
  }, p.name), p.popular && /*#__PURE__*/React.createElement(Badge, {
    tone: "teal"
  }, "Most popular")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 48,
      letterSpacing: '-1.5px',
      color: 'var(--ink)',
      lineHeight: 1
    }
  }, p.price), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)'
    }
  }, p.cadence)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.5,
      color: 'var(--text-body)',
      margin: 0
    }
  }, p.blurb), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--border-strong)',
      opacity: .6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, p.features.map(f => /*#__PURE__*/React.createElement("div", {
    key: f,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 15,
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 17,
    color: "var(--teal-600)",
    stroke: 2.25
  }), f))), /*#__PURE__*/React.createElement(Button, {
    variant: p.popular ? 'primary' : 'secondary',
    href: "#contact",
    style: {
      marginTop: 6,
      justifyContent: 'center'
    }
  }, p.price === 'Custom' ? 'Talk to us' : 'Start with ' + p.name))))));
}

// Contact form card on a sand section.
function Contact() {
  return /*#__PURE__*/React.createElement("section", {
    id: "contact",
    style: {
      background: 'var(--sand)',
      padding: '96px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: MKT,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Start a project"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 46,
      lineHeight: 1.1,
      letterSpacing: '-1px',
      color: 'var(--ink)',
      margin: '16px 0 0'
    }
  }, "Let\u2019s build one that pays for itself"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      lineHeight: 1.55,
      color: 'var(--text-body)',
      marginTop: 18,
      maxWidth: 420
    }
  }, "Tell us a little about the business and what you need. We\u2019ll reply within a day with a straight answer on fit, timeline, and budget."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: 28
    }
  }, [['mail', 'hello@franciswebagency.com'], ['phone', '(415) 555-0142'], ['map-pin', 'Remote · US & Canada']].map(([ic, t]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 15,
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 18,
    color: "var(--action)"
  }), t)))), /*#__PURE__*/React.createElement(Card, {
    surface: "canvas",
    radius: "xl",
    padding: 32,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Name",
    placeholder: "Jordan Rivera"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Company",
    placeholder: "Northwind Co."
  })), /*#__PURE__*/React.createElement(Input, {
    label: "Work email",
    type: "email",
    placeholder: "you@company.com"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "What do you need?",
    textarea: true,
    placeholder: "A new marketing site, a redesign, a web app\u2026"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    style: {
      justifyContent: 'center',
      marginTop: 4
    }
  }, "Send it over"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      textAlign: 'center',
      margin: 0
    }
  }, "No jargon, no ghosting, no surprise invoices."))));
}
Object.assign(window, {
  Pricing,
  Contact
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Pricing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Services.jsx
try { (() => {
// FWA marketing — services section. 3-column service cards.
const SERVICES = [{
  icon: 'gauge',
  title: 'Performance',
  body: 'Sites that load in under a second and stay fast — because speed is revenue, not a nice-to-have.'
}, {
  icon: 'layout-panel-left',
  title: 'Design & experience',
  body: 'Clean, intuitive interfaces built around exactly what your visitor needs to do next.'
}, {
  icon: 'search',
  title: 'SEO & visibility',
  body: 'Structure and search work that helps the right people actually find the business.'
}, {
  icon: 'blocks',
  title: 'Custom web apps',
  body: 'Internal tools and customer platforms engineered to scale to 10x your traffic.'
}, {
  icon: 'line-chart',
  title: 'Conversion',
  body: 'Pages designed to turn visitors into leads and customers, then measured and tuned.'
}, {
  icon: 'handshake',
  title: 'Partnership',
  body: 'A plain-spoken collaborator that sticks around after launch. No ghosting.'
}];
function Services() {
  return /*#__PURE__*/React.createElement("section", {
    id: "services",
    style: {
      width: MKT,
      margin: '0 auto',
      padding: '96px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Our services"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 48,
      lineHeight: 1.1,
      letterSpacing: '-1px',
      color: 'var(--ink)',
      margin: '16px 0 0'
    }
  }, "Everything the site needs to earn its keep"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      lineHeight: 1.5,
      color: 'var(--text-body)',
      marginTop: 18
    }
  }, "We design, build, and look after the whole thing \u2014 from the first wireframe to the analytics six months in.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 20,
      marginTop: 48
    }
  }, SERVICES.map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.title,
    surface: "canvas",
    padding: 28,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 'var(--r-md)',
      background: 'var(--mist)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    size: 24,
    color: "var(--teal-600)",
    stroke: 1.75
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 500,
      fontSize: 26,
      letterSpacing: '-.3px',
      color: 'var(--ink)',
      margin: 0
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.55,
      color: 'var(--text-body)',
      margin: 0
    }
  }, s.body), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      marginTop: 'auto',
      paddingTop: 6,
      color: 'var(--action)',
      fontWeight: 600,
      fontSize: 14,
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, "Learn more ", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 16,
    color: "var(--action)"
  }))))));
}
Object.assign(window, {
  Services
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Services.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.StatusChip = __ds_scope.StatusChip;

})();
