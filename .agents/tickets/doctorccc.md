+++
schema = 2
name = "doctorccc"
outcome = "mise run doctor's ccc-daemon check matches the GPU-only design: it PASSes for an enabled, active daemon whose live launcher is the GPU-only one (no CPU embedding path, elastic cap with gpu_partition_ccc_mib as floor) and FAILs on the old reservation-yield / CPU-fallback launcher"
writes = ["scripts/doctor.ts", "scripts/tests/doctor.test.ts"]
verify = ["bun test scripts/tests/doctor.test.ts", "mise run gate:land"]
timeout_s = 900
premises = ["file:scripts/doctor.ts", "file:cocoindex/ccc_gpu_yield.py"]

[proposition]
id = "DOCTOR-CCC-GPU-ONLY"
claim = "doctor passes the deployed GPU-only ccc daemon and fails a fixture describing the old reservation-yield launcher"
refuted_by = "doctor reports 'reservation-yield policy: false' FAIL for the GPU-only daemon, or passes the old launcher"
+++

Live 2026-10-15 after deploy (alpha with cccgpu 47f400ff and cccpart 3a51ac46): `mise run doctor` prints
    FAIL ccc-daemon  ccc-daemon.service is enabled / active; real unit: true; default.target edge: true;
                     reservation-yield policy: false — supervised searches need an enabled, active daemon with the
                     declared GPU policy
The "reservation-yield policy" is the pre-cccgpu design (any research reservation sent ccc to CPU). The current design
(cocoindex/ccc_gpu_yield.py, ccc-daemon.service.wsl) is GPU-only: waits instead of CPU, own partition, elastic cap.
Do: replace that sub-check with one that reads the declared policy from the unit and launcher (env
CCC_GPU_UTILIZATION_PERCENT/CCC_GPU_BATCH_SIZE present, launcher is ccc-daemon-launch.py, no CPU fallback flag), with
tests for pass and for the old shape. Do not restart services. Do not commit or push.
