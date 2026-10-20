@echo off
rem Gia lap tai (TC-11): run-loadsim.bat clients=20 duration=600 server=127.0.0.1:5000
call "%~dp0_java.bat"
pushd "%ROOT%"
"%JAVA%" -jar loadsim\target\loadsim.jar %*
popd
