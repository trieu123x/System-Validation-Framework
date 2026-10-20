@echo off
rem Chay cac thuc nghiem so sanh baseline / de xuat (docs\EXPERIMENTS.md).
rem Can: da build (scripts\build.bat), da nap db\seed_loadsim.sql, cong 5000 va 8080 dang trong.
rem VD: run-experiments.bat run=all      hoac   run-experiments.bat run=e1,e3 e1.reps=10
call "%~dp0_java.bat"
pushd "%ROOT%"
"%JAVA%" -cp loadsim\target\loadsim.jar phanphoi.loadsim.Experiments %*
popd
