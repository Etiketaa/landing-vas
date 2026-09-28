const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/auth');
const { getReleaseState, setStage, setFlag, STAGES } = require('../../lib/features');

// Estado y control del release. Ver lib/features.js.
router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const state = await getReleaseState();
    res.json({ ...state, stages: STAGES });
  } catch (err) {
    console.error('Error al leer el estado de releases:', err.message);
    res.status(500).json({ error: 'Error al leer el estado de releases' });
  }
});

router.put('/stage', async (req, res) => {
  try {
    const { stage } = req.body;

    if (stage === undefined || stage === null) {
      return res.status(400).json({ error: 'Falta la etapa' });
    }

    const state = await setStage(stage);
    res.json({ ...state, stages: STAGES, message: `Etapa ${state.stage} activa` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/flags/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Falta el valor de enabled' });
    }

    const state = await setFlag(key, enabled);
    const feature = state.features.find((f) => f.key === key);

    res.json({
      ...state,
      stages: STAGES,
      message: `${feature.label}: ${feature.active ? 'activa' : 'inactiva'}`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
